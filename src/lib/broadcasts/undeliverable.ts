import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Keeping numbers that are not on WhatsApp out of every future
 * broadcast, automatically.
 *
 * Meta answers a send to a non-WhatsApp number with error #131026
 * ("Message undeliverable"). Left alone those numbers are retried on
 * every campaign: they burn the 250/24h tier limit, inflate the
 * approved recipient count, and drag the quality rating down.
 *
 * This rides on the existing exclude-tag mechanism rather than a new
 * column, because exclude tags are ALREADY honoured identically by the
 * geo RPC, by every non-geo audience branch, and by both the step 2 and
 * step 4 counts. A new flag would have to be re-plumbed through all of
 * them — which is exactly how the count/send divergence happened before.
 *
 * #131026 only. Other failures are NOT the number's fault:
 *   #131048 spam rate limit, #131049 ecosystem pacing,
 *   #130472 user experiment — all retryable, all real customers.
 */
export const UNDELIVERABLE_TAG = 'not-on-whatsapp';

/** Meta's "this number is not a WhatsApp user" error. */
export function isUndeliverableError(message: string | null | undefined): boolean {
  return !!message && message.includes('131026');
}

/**
 * Resolve the tag id, creating the tag on first use. Returns null if it
 * cannot be resolved — callers must treat that as "no extra exclusion"
 * and still send, since silently dropping the whole audience would be
 * far worse than one wasted retry.
 */
export async function getUndeliverableTagId(
  db: SupabaseClient,
  accountId: string,
  userId?: string,
): Promise<string | null> {
  const { data: existing } = await db
    .from('tags')
    .select('id')
    .eq('account_id', accountId)
    .eq('name', UNDELIVERABLE_TAG)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  if (!userId) return null;

  const { data: created } = await db
    .from('tags')
    .insert({
      account_id: accountId,
      user_id: userId,
      name: UNDELIVERABLE_TAG,
      color: '#ef4444',
    })
    .select('id')
    .maybeSingle();
  return (created?.id as string) ?? null;
}

/**
 * Tag the contacts behind a batch of #131026 failures. Best-effort: a
 * failure here must never break the send loop that called it.
 */
export async function markUndeliverable(
  db: SupabaseClient,
  tagId: string,
  contactIds: string[],
): Promise<void> {
  if (!tagId || contactIds.length === 0) return;
  try {
    // onConflict ignore — a contact already tagged from an earlier
    // campaign must not error the whole batch.
    await db
      .from('contact_tags')
      .upsert(
        contactIds.map((contact_id) => ({ contact_id, tag_id: tagId })),
        { onConflict: 'contact_id,tag_id', ignoreDuplicates: true },
      );
  } catch (err) {
    console.error('[broadcast] failed to tag undeliverable contacts:', err);
  }
}
