'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Contact, MessageTemplate } from '@/types';
import { geoAudienceRpcArgs } from '@/lib/broadcasts/geo-audience';
import {
  getUndeliverableTagId,
  isUndeliverableError,
  markUndeliverable,
} from '@/lib/broadcasts/undeliverable';
import { normalizeKey } from '@/lib/contacts/dedupe';
import { phonesMatch } from '@/lib/whatsapp/phone-utils';

export type CustomFieldOperator = 'is' | 'is_not' | 'contains';

export interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

export interface AudienceConfig {
  type: 'geo' | 'all' | 'tags' | 'custom_field' | 'csv' | 'contacts';
  /** Geo targeting. Empty `mandals` with a district = whole district;
   *  empty `districts` = every district. */
  districts?: string[];
  mandals?: string[];
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: { phone: string; name?: string }[];
  /** Explicit contact ids — used to re-target a hand-picked set of recipients (e.g. from the broadcast detail page's Smart Segregation table). */
  contactIds?: string[];
  /** Contacts carrying any of these tags are subtracted from the result. */
  excludeTagIds?: string[];
}

/**
 * Variable mapping — each template placeholder (by key, usually "1",
 * "2", …) is resolved at send time. `field` maps to a built-in contact
 * field (name/phone/email/company); `custom_field` maps to a
 * contact_custom_values.value row keyed by the custom_fields.id stored
 * in `value`.
 */
export type VariableMapping =
  | { type: 'static'; value: string }
  | { type: 'field'; value: string }
  | { type: 'custom_field'; value: string };

interface BroadcastPayload {
  name: string;
  template: MessageTemplate;
  audience: AudienceConfig;
  variables: Record<string, VariableMapping>;
  /**
   * Media URL for an IMAGE/VIDEO/DOCUMENT header. Required at send
   * time for media-header templates — Meta rejects the send without
   * it. Passed through as `messageParams.headerMediaUrl`; the builder
   * falls back to the template's stored URL only when this is empty.
   */
  headerMediaUrl?: string;
}

interface UseBroadcastSendingReturn {
  createAndSendBroadcast: (payload: BroadcastPayload) => Promise<string>;
  isProcessing: boolean;
  progress: number;
}

/**
 * Meta rate-limit buffer. 10 per batch + 1 s pause matches the spec
 * and keeps us comfortably under Meta's per-phone-number messaging
 * rate so a large broadcast never trips the upstream limiter.
 */
const SEND_BATCH_SIZE = 10;
const SEND_BATCH_DELAY_MS = 1000;

/** `broadcast_recipients` inserts are independent of the send rate. */
const INSERT_BATCH_SIZE = 200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BroadcastApiResult {
  phone: string;
  status: 'sent' | 'failed';
  whatsapp_message_id?: string;
  error?: string;
}

/** contactId → (customFieldId → value). */
type CustomValueIndex = Map<string, Map<string, string>>;

// Variable resolution lives in `@/lib/broadcasts/variables` so the
// wizard preview and the server-side sender can't drift apart. It also
// applies the fallback + sanitisation Meta requires (an empty or
// newline-bearing parameter fails the send). Imported for local use in
// the send loop below and re-exported for existing callers.
import { resolveVariables } from '@/lib/broadcasts/variables';
import { buildBroadcastRequestBody } from '@/lib/broadcasts/send-payload';

export { resolveVariables };

/**
 * Bulk-fetch contact_custom_values for a set of contacts. Returns an
 * index keyed by contact_id → field_id → value.
 */
async function fetchCustomValueIndex(
  supabase: ReturnType<typeof createClient>,
  contactIds: string[],
): Promise<CustomValueIndex> {
  const index: CustomValueIndex = new Map();
  if (contactIds.length === 0) return index;

  // Supabase PostgREST caps the .in(...) IN-clause roughly at 1000
  // values. Page through to stay safe.
  const PAGE = 500;
  for (let i = 0; i < contactIds.length; i += PAGE) {
    const slice = contactIds.slice(i, i + PAGE);
    const { data } = await supabase
      .from('contact_custom_values')
      .select('contact_id, custom_field_id, value')
      .in('contact_id', slice);

    for (const row of data ?? []) {
      const bucket = index.get(row.contact_id) ?? new Map<string, string>();
      bucket.set(row.custom_field_id, row.value ?? '');
      index.set(row.contact_id, bucket);
    }
  }
  return index;
}

export function useBroadcastSending(): UseBroadcastSendingReturn {
  const { accountId } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  async function resolveAudience(audience: AudienceConfig): Promise<Contact[]> {
    const supabase = createClient();

    // Numbers Meta has already told us are not on WhatsApp. Excluded
    // from every audience type, always — they cannot receive anything,
    // and retrying them burns the 250/24h tier limit and the quality
    // rating. Folded into the geo RPC args below and into the shared
    // exclude-tag pass at the end, so the count and the send agree.
    const undeliverableTagId = accountId
      ? await getUndeliverableTagId(supabase, accountId)
      : null;

    let contacts: Contact[] = [];

    if (audience.type === 'geo') {
      // Resolved server-side by the same RPC that produced the count in
      // step 2 — so the number the user approved is exactly the number
      // that gets messaged. p_limit null returns the whole audience.
      if (!accountId) throw new Error('Your profile is not linked to an account.');
      const { data, error } = await supabase.rpc(
        'resolve_broadcast_audience',
        geoAudienceRpcArgs(accountId, audience, null, [undeliverableTagId]),
      );
      if (error) throw new Error(`Failed to resolve audience: ${error.message}`);
      contacts = ((data ?? []) as { contact: Contact }[]).map((r) => r.contact);
      return contacts;
    } else if (audience.type === 'all') {
      const { data, error } = await supabase.from('contacts').select('*');
      if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
      contacts = data ?? [];
    } else if (
      audience.type === 'tags' &&
      audience.tagIds &&
      audience.tagIds.length > 0
    ) {
      const { data: contactTags, error: tagError } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.tagIds);

      if (tagError)
        throw new Error(`Failed to fetch contact tags: ${tagError.message}`);

      if (contactTags && contactTags.length > 0) {
        const uniqueContactIds = [
          ...new Set(contactTags.map((ct) => ct.contact_id)),
        ];
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .in('id', uniqueContactIds);
        if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
        contacts = data ?? [];
      }
    } else if (audience.type === 'custom_field' && audience.customField) {
      contacts = await resolveCustomFieldAudience(supabase, audience.customField);
    } else if (audience.type === 'csv' && audience.csvContacts) {
      contacts = await upsertCsvContacts(supabase, audience.csvContacts);
    } else if (
      audience.type === 'contacts' &&
      audience.contactIds &&
      audience.contactIds.length > 0
    ) {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .in('id', audience.contactIds);
      if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
      contacts = data ?? [];
    }

    // Apply exclude tags (works across all contact-derived audience
    // types — including CSV, whose rows are upserted into real contacts
    // above and so can carry tags like any other).
    // The geo branch already excluded these server-side, but every other
    // branch reaches here unfiltered — so the not-on-whatsapp tag is
    // appended for all of them.
    const excludeTagIds = [
      ...new Set(
        [...(audience.excludeTagIds ?? []), undeliverableTagId].filter(
          (id): id is string => !!id,
        ),
      ),
    ];
    if (excludeTagIds.length > 0) {
      const { data: excludeRows } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', excludeTagIds);
      const excludedIds = new Set((excludeRows ?? []).map((r) => r.contact_id));
      contacts = contacts.filter((c) => !excludedIds.has(c.id));
    }

    return contacts;
  }

  /**
   * CSV uploads arrive as raw phone/name pairs, not DB rows. Before we
   * can insert broadcast_recipients (whose contact_id FKs contacts.id),
   * we need real contacts.id UUIDs. So: look up each CSV phone in the
   * caller's contacts table; insert any that don't exist; return the
   * resolved set.
   *
   * Pre-existing implementation synthesized `csv-N` strings as
   * contact_id, which failed the UUID cast on insert — every CSV
   * broadcast silently created zero recipients.
   */
  async function upsertCsvContacts(
    supabase: ReturnType<typeof createClient>,
    csvRows: { phone: string; name?: string }[],
  ): Promise<Contact[]> {
    if (csvRows.length === 0) return [];

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      throw new Error('You are not signed in.');
    }
    if (!accountId) {
      throw new Error('Your profile is not linked to an account.');
    }

    // De-duplicate on the canonical digits-only key, not the raw string:
    // "9493847755", "+91 94938 47755" and "094938-47755" are one person.
    const uniqueByKey = new Map<string, { phone: string; name?: string }>();
    for (const row of csvRows) {
      const key = normalizeKey(row.phone);
      if (key && !uniqueByKey.has(key)) uniqueByKey.set(key, row);
    }
    const keys = [...uniqueByKey.keys()];

    // Look up existing contacts by the last-8-digit suffix, then apply
    // the strict `phonesMatch` in JS — the same two-stage rule
    // src/lib/contacts/dedupe.ts uses for the webhook and the contact
    // form. Matching the raw `phone` string instead (as this used to)
    // missed every bare local number against a stored "+91…" row and
    // inserted a permanent duplicate that the unique index on
    // (account_id, phone_normalized) could not catch either. The lookup
    // is also scoped by account_id, not user_id: a teammate's contact in
    // the same account is the same contact.
    const byKey = new Map<string, Contact>();
    const SUFFIX_CHUNK = 50;
    for (let i = 0; i < keys.length; i += SUFFIX_CHUNK) {
      const chunk = keys.slice(i, i + SUFFIX_CHUNK);
      const filters = chunk
        .map((k) => `phone_normalized.like.*${k.length >= 8 ? k.slice(-8) : k}`)
        .join(',');
      const { data: existing, error: lookupErr } = await supabase
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .or(filters);
      if (lookupErr) {
        throw new Error(`Failed to look up CSV contacts: ${lookupErr.message}`);
      }
      for (const c of (existing ?? []) as Contact[]) {
        const hit = chunk.find((k) => phonesMatch(c.phone, k));
        if (hit && !byKey.has(hit)) byKey.set(hit, c);
      }
    }

    // Insert only missing contacts, in one batch per 200 rows (PostgREST
    // has a default payload cap — 200 keeps individual requests small).
    // Store E.164 so new rows match the existing "+91…" convention.
    const missing = keys
      .filter((k) => !byKey.has(k))
      .map((key) => ({
        user_id: user.id,
        account_id: accountId,
        phone: `+${key}`,
        name: uniqueByKey.get(key)?.name ?? null,
      }));

    const INSERT_CHUNK = 200;
    for (let i = 0; i < missing.length; i += INSERT_CHUNK) {
      const chunk = missing.slice(i, i + INSERT_CHUNK);
      const { data: inserted, error: insertErr } = await supabase
        .from('contacts')
        .insert(chunk)
        .select();
      if (insertErr) {
        throw new Error(`Failed to create CSV contacts: ${insertErr.message}`);
      }
      for (const c of (inserted ?? []) as Contact[]) {
        const key = normalizeKey(c.phone);
        if (key) byKey.set(key, c);
      }
    }

    // Preserve input order so analytics roughly matches the CSV order.
    return keys
      .map((k) => byKey.get(k))
      .filter((c): c is Contact => Boolean(c));
  }

  async function resolveCustomFieldAudience(
    supabase: ReturnType<typeof createClient>,
    filter: CustomFieldFilter,
  ): Promise<Contact[]> {
    const { fieldId, operator, value } = filter;

    // Build the WHERE clause for the operator. PostgREST supports
    // eq/neq/ilike via the query builder — use ilike with wildcards
    // for "contains" so the match is case-insensitive.
    let query = supabase
      .from('contact_custom_values')
      .select('contact_id')
      .eq('custom_field_id', fieldId);

    if (operator === 'is') query = query.eq('value', value);
    else if (operator === 'is_not') query = query.neq('value', value);
    else if (operator === 'contains') query = query.ilike('value', `%${value}%`);

    const { data: matches, error: matchErr } = await query;
    if (matchErr)
      throw new Error(`Custom-field filter failed: ${matchErr.message}`);

    const contactIds = [...new Set((matches ?? []).map((m) => m.contact_id))];
    if (contactIds.length === 0) return [];

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .in('id', contactIds);
    if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
    return data ?? [];
  }

  async function createAndSendBroadcast(payload: BroadcastPayload): Promise<string> {
    setIsProcessing(true);
    setProgress(0);

    const supabase = createClient();

    try {
      // ── Step 0: Resolve current user ──────────────────────────────
      // broadcasts.user_id is NOT NULL + guarded by RLS
      // (auth.uid() = user_id). Without this, the INSERT below was
      // silently failing with 23502 / 42501 — the wizard would
      // no-op with no feedback.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        throw new Error('You are not signed in.');
      }
      if (!accountId) {
        throw new Error('Your profile is not linked to an account.');
      }

      // Resolved once for the whole run so the per-batch failure handler
      // can tag non-WhatsApp numbers without a lookup per batch. Created
      // on first use if the tag does not exist yet.
      const undeliverableTagId = await getUndeliverableTagId(
        supabase,
        accountId,
        user.id,
      );

      // ── Step 1: Resolve audience contacts ─────────────────────────
      setProgress(5);
      const contacts = await resolveAudience(payload.audience);

      if (contacts.length === 0) {
        throw new Error('No contacts found for this audience.');
      }

      // ── Step 2: Create broadcast row ──────────────────────────────
      setProgress(10);
      const { data: broadcast, error: broadcastError } = await supabase
        .from('broadcasts')
        .insert({
          user_id: user.id,
          account_id: accountId,
          name: payload.name,
          template_name: payload.template.name,
          template_language: payload.template.language ?? 'en_US',
          template_variables: payload.variables,
          audience_filter: {
            type: payload.audience.type,
            districts: payload.audience.districts,
            mandals: payload.audience.mandals,
            tagIds: payload.audience.tagIds,
            customField: payload.audience.customField,
            excludeTagIds: payload.audience.excludeTagIds,
            contactIds: payload.audience.contactIds,
          },
          status: 'sending',
          total_recipients: contacts.length,
          sent_count: 0,
          delivered_count: 0,
          read_count: 0,
          replied_count: 0,
          failed_count: 0,
        })
        .select()
        .single();

      if (broadcastError || !broadcast) {
        throw new Error(
          `Failed to create broadcast: ${broadcastError?.message ?? 'unknown error'}`,
        );
      }

      // ── Step 3: Insert recipient rows ─────────────────────────────
      setProgress(20);
      const recipientRows = contacts.map((contact) => ({
        broadcast_id: broadcast.id,
        contact_id: contact.id,
        status: 'pending' as const,
      }));

      for (let i = 0; i < recipientRows.length; i += INSERT_BATCH_SIZE) {
        const batch = recipientRows.slice(i, i + INSERT_BATCH_SIZE);
        const { error: recipientError } = await supabase
          .from('broadcast_recipients')
          .insert(batch);
        if (recipientError) {
          // Previous impl logged and marched on — the broadcast then ran
          // with an incomplete recipient set, so webhook status updates
          // couldn't find some rows and the aggregate counts drifted.
          // Flip the broadcast to failed so the user sees the problem
          // immediately, then throw to abort the send loop.
          await supabase
            .from('broadcasts')
            .update({
              status: 'failed',
              failed_count: contacts.length,
            })
            .eq('id', broadcast.id);
          throw new Error(
            `Failed to insert recipient batch ${i / INSERT_BATCH_SIZE + 1}: ${recipientError.message}`,
          );
        }
      }

      // ── Step 4: Fetch recipients (joined contact) + preload custom values
      setProgress(30);
      const { data: recipients, error: recipientsFetchError } = await supabase
        .from('broadcast_recipients')
        .select('*, contact:contacts(*)')
        .eq('broadcast_id', broadcast.id);

      if (recipientsFetchError || !recipients) {
        throw new Error('Failed to fetch broadcast recipients');
      }

      // One bulk fetch of custom values for every contact in this
      // broadcast, avoiding N+1 during the send loop.
      const contactIds = recipients
        .map((r) => r.contact?.id)
        .filter((id): id is string => Boolean(id));
      const customValueIndex = await fetchCustomValueIndex(
        supabase,
        contactIds,
      );

      let failedCount = 0;
      const totalRecipients = recipients.length;

      // Media-header templates (image/video/document) require a media
      // URL on every send. Collected in the personalize step and applied
      // to all recipients; falls back to the template's stored URL on the
      // server when omitted.
      const headerType = payload.template.header_type;
      const isMediaHeader =
        headerType === 'image' ||
        headerType === 'video' ||
        headerType === 'document';
      const headerMediaUrl = payload.headerMediaUrl?.trim();
      const messageParams =
        isMediaHeader && headerMediaUrl ? { headerMediaUrl } : undefined;

      for (let i = 0; i < recipients.length; i += SEND_BATCH_SIZE) {
        const batch = recipients.slice(i, i + SEND_BATCH_SIZE);

        const apiRecipients = batch
          .filter((r) => r.contact?.phone)
          .map((r) => ({
            phone: r.contact!.phone as string,
            params: r.contact
              ? resolveVariables(
                  payload.variables,
                  r.contact,
                  customValueIndex.get(r.contact.id),
                )
              : [],
          }));

        if (apiRecipients.length === 0) continue;

        try {
          // Shared with the wizard's "Send test" so the two can never
          // disagree about where headerMediaUrl belongs.
          const res = await fetch('/api/whatsapp/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              buildBroadcastRequestBody({
                templateName: payload.template.name,
                templateLanguage: payload.template.language,
                headerType: payload.template.header_type,
                headerMediaUrl: payload.headerMediaUrl,
                recipients: apiRecipients,
              }),
            ),
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || 'Broadcast API request failed');
          }

          const resultsByPhone = new Map<string, BroadcastApiResult>();
          for (const r of (data.results ?? []) as BroadcastApiResult[]) {
            resultsByPhone.set(r.phone, r);
          }

          // Contacts Meta rejected as non-WhatsApp in THIS batch, tagged
          // after the loop so they are skipped by every future campaign
          // instead of being retried forever.
          const undeliverableNow: string[] = [];

          for (const recipient of batch) {
            const phone = recipient.contact?.phone;
            const result = phone ? resultsByPhone.get(phone) : undefined;

            if (!result) {
              failedCount++;
              await supabase
                .from('broadcast_recipients')
                .update({
                  status: 'failed',
                  error_message: 'No phone number on contact',
                })
                .eq('id', recipient.id);
              continue;
            }

            if (result.status === 'sent') {
              await supabase
                .from('broadcast_recipients')
                .update({
                  status: 'sent',
                  sent_at: new Date().toISOString(),
                  whatsapp_message_id: result.whatsapp_message_id ?? null,
                  error_message: null,
                })
                .eq('id', recipient.id);
            } else {
              failedCount++;
              await supabase
                .from('broadcast_recipients')
                .update({
                  status: 'failed',
                  error_message: result.error ?? 'Unknown error',
                })
                .eq('id', recipient.id);
              // #131026 only — the number is not on WhatsApp. Spam-rate
              // (#131048), pacing (#131049) and experiment (#130472)
              // failures are retryable and must NOT be tagged.
              if (
                isUndeliverableError(result.error) &&
                recipient.contact?.id
              ) {
                undeliverableNow.push(recipient.contact.id);
              }
            }
          }

          if (undeliverableTagId && undeliverableNow.length > 0) {
            await markUndeliverable(
              supabase,
              undeliverableTagId,
              undeliverableNow,
            );
          }
        } catch (err) {
          for (const recipient of batch) {
            failedCount++;
            await supabase
              .from('broadcast_recipients')
              .update({
                status: 'failed',
                error_message: err instanceof Error ? err.message : 'Unknown error',
              })
              .eq('id', recipient.id);
          }
        }

        const progressPct =
          30 + Math.round(((i + batch.length) / totalRecipients) * 60);
        setProgress(progressPct);

        if (i + SEND_BATCH_SIZE < recipients.length) {
          await sleep(SEND_BATCH_DELAY_MS);
        }
      }

      // ── Step 5: Finalize status ───────────────────────────────────
      // Aggregate counts are maintained by the DB trigger (migration
      // 003); we only flip the final status here.
      setProgress(95);
      const finalStatus = failedCount === totalRecipients ? 'failed' : 'sent';
      await supabase
        .from('broadcasts')
        .update({ status: finalStatus })
        .eq('id', broadcast.id);

      setProgress(100);
      return broadcast.id;
    } finally {
      setIsProcessing(false);
    }
  }

  return { createAndSendBroadcast, isProcessing, progress };
}
