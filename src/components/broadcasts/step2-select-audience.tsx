'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Contact, CustomField, Tag } from '@/types';
import { parseContactCsv } from '@/lib/contacts/parse-contact-csv';
import { isValidE164 } from '@/lib/whatsapp/phone-utils';
import { orLiteral } from '@/lib/supabase/or-filter';
import {
  geoAudienceRpcArgs,
  targetsEveryone,
} from '@/lib/broadcasts/geo-audience';
import { getUndeliverableTagId } from '@/lib/broadcasts/undeliverable';
import { Button } from '@/components/ui/button';
import {
  Users,
  Tags,
  Filter,
  Upload,
  Loader2,
  ArrowRight,
  ArrowLeft,
  MapPin,
  X,
  Search,
  Check,
  ChevronDown,
  FileUp,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/use-auth';
import { GeoAudiencePicker } from './geo-audience-picker';

type AudienceType = 'geo' | 'all' | 'tags' | 'custom_field' | 'csv' | 'contacts';
type CustomFieldOperator = 'is' | 'is_not' | 'contains';

interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

interface AudienceConfig {
  type: AudienceType;
  /** Geo targeting — the dealership's primary audience method. Empty
   *  `mandals` with a district means "everyone in that district". */
  districts?: string[];
  mandals?: string[];
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: { phone: string; name?: string }[];
  /** Explicit contact ids — set when arriving via ?contacts= from the broadcast detail page's re-target flow. Not one of the four selectable audience-method cards. */
  contactIds?: string[];
  excludeTagIds?: string[];
}

interface Step2Props {
  audience: AudienceConfig;
  onUpdate: (audience: AudienceConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step2SelectAudience({
  audience,
  onUpdate,
  onNext,
  onBack,
}: Step2Props) {
  const t = useTranslations('Broadcasts.wizard');
  const { accountId } = useAuth();

  const OPERATOR_OPTIONS = useMemo<{ value: CustomFieldOperator; label: string }[]>(() => [
    { value: 'is', label: t('selectAudience.operatorIs') },
    { value: 'is_not', label: t('selectAudience.operatorIsNot') },
    { value: 'contains', label: t('selectAudience.operatorContains') },
  ], [t]);

  /** Group-sending methods. Picking named people is not among them —
   *  that path is the always-visible search box above these cards, so
   *  it needs no mode to select. Area is the everyday group choice;
   *  the rest are bulk/power tooling behind the disclosure. */
  const primaryOptions = useMemo<{
    type: AudienceType;
    label: string;
    description: string;
    icon: typeof Users;
  }[]>(() => [
    {
      type: 'geo',
      label: t('selectAudience.method.geo'),
      description: t('selectAudience.geoDesc'),
      icon: MapPin,
    },
  ], [t]);

  const advancedOptions = useMemo<{
    type: AudienceType;
    label: string;
    description: string;
    icon: typeof Users;
  }[]>(() => [
    {
      type: 'all',
      label: t('selectAudience.method.all'),
      description: t('selectAudience.allDescLoading'),
      icon: Users,
    },
    {
      type: 'tags',
      label: t('selectAudience.method.tags'),
      description: t('selectAudience.tagDesc'),
      icon: Tags,
    },
    {
      type: 'custom_field',
      label: t('selectAudience.method.customField'),
      description: t('selectAudience.customFieldDesc'),
      icon: Filter,
    },
    {
      type: 'csv',
      label: t('selectAudience.method.csv'),
      description: t('selectAudience.csvDesc'),
      icon: Upload,
    },
  ], [t]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  // --- Contact picker (audience.type === 'contacts') ---
  const [contactQuery, setContactQuery] = useState('');
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  /** Full rows for the picked ids, so chips can show names rather than
   *  bare uuids. Seeded from `contactIds` for the ?contacts= re-target
   *  flow, then kept in step with every pick/unpick. */
  const [pickedContacts, setPickedContacts] = useState<Contact[]>([]);

  const [showAdvanced, setShowAdvanced] = useState(() =>
    ['all', 'tags', 'custom_field', 'csv'].includes(audience.type),
  );
  const [csvError, setCsvError] = useState<string | null>(null);

  // Tags are used both by the primary "Filter by Tags" audience type
  // AND by the exclude-list below — so always load once on mount.
  useEffect(() => {
    async function fetchTags() {
      setLoadingTags(true);
      try {
        const supabase = createClient();
        const { data } = await supabase.from('tags').select('*').order('name');
        setTags(data ?? []);
      } finally {
        setLoadingTags(false);
      }
    }
    fetchTags();
  }, []);

  // Lazy-load custom fields only when that audience type is active.
  useEffect(() => {
    if (audience.type !== 'custom_field') return;
    async function fetchFields() {
      setLoadingFields(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('custom_fields')
          .select('*')
          .order('field_name');
        setCustomFields(data ?? []);
      } finally {
        setLoadingFields(false);
      }
    }
    fetchFields();
  }, [audience.type]);

  // Hydrate chip labels for ids that arrived via ?contacts= (re-target
  // flow) — those come in as bare ids with no row attached.
  useEffect(() => {
    const ids = audience.contactIds ?? [];
    const missing = ids.filter((id) => !pickedContacts.some((c) => c.id === id));
    if (missing.length === 0) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .in('id', missing);
      if (data?.length) setPickedContacts((prev) => [...prev, ...data]);
    })();
  }, [audience.contactIds, pickedContacts]);

  // Debounced contact search. Matches name or phone; the phone term is
  // digit-stripped too so "6309534366" finds a "+91 63095 34366" row.
  useEffect(() => {
    const term = contactQuery.trim();
    if (term.length < 2) {
      setContactResults([]);
      setSearchingContacts(false);
      return;
    }
    let cancelled = false;
    setSearchingContacts(true);
    const timer = setTimeout(async () => {
      try {
        const supabase = createClient();
        const digits = term.replace(/\D/g, '');
        const filters = [
          `name.ilike.${orLiteral(`%${term}%`)}`,
          `phone.ilike.${orLiteral(`%${term}%`)}`,
        ];
        if (digits.length >= 4) filters.push(`phone_normalized.ilike.%${digits}%`);
        const { data } = await supabase
          .from('contacts')
          .select('*')
          .or(filters.join(','))
          .order('name')
          .limit(25);
        if (!cancelled) setContactResults(data ?? []);
      } finally {
        if (!cancelled) setSearchingContacts(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Not inside the `cancelled` guard above: superseding a pending
      // search must clear the spinner, or backspacing below 2 chars
      // mid-debounce leaves it spinning forever and suppresses the
      // "nobody matches" empty state.
      setSearchingContacts(false);
    };
  }, [contactQuery]);

  const fetchEstimatedCount = useCallback(async () => {
    setLoadingCount(true);
    try {
      const supabase = createClient();

      // Base query — produces the superset before exclude is applied.
      let baseIds: Set<string> | null = null; // null means "all contacts"

      if (audience.type === 'geo') {
        // Counted server-side: the RPC applies district/mandal/exclude
        // in one query and returns the windowed total, so the number is
        // right even past PostgREST's ~1000-row ceiling.
        if (!accountId) {
          setEstimatedCount(null);
          return;
        }
        const { data, error } = await supabase.rpc(
          'resolve_broadcast_audience',
          geoAudienceRpcArgs(accountId, audience, 1, [
            await getUndeliverableTagId(supabase, accountId),
          ]),
        );
        if (error) {
          setEstimatedCount(null);
          return;
        }
        const row = (data ?? [])[0] as { total_count?: number } | undefined;
        setEstimatedCount(Number(row?.total_count ?? 0));
        return;
      } else if (audience.type === 'all') {
        // Handled below — full-table count adjusted by excludes.
      } else if (
        audience.type === 'tags' &&
        audience.tagIds &&
        audience.tagIds.length > 0
      ) {
        const { data } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.tagIds);
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        audience.type === 'custom_field' &&
        audience.customField?.fieldId &&
        audience.customField.value
      ) {
        const { fieldId, operator, value } = audience.customField;
        let q = supabase
          .from('contact_custom_values')
          .select('contact_id')
          .eq('custom_field_id', fieldId);
        if (operator === 'is') q = q.eq('value', value);
        else if (operator === 'is_not') q = q.neq('value', value);
        else q = q.ilike('value', `%${value}%`);
        const { data } = await q;
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        audience.type === 'csv' &&
        audience.csvContacts &&
        audience.csvContacts.length > 0
      ) {
        // De-duped by phone to match upsertCsvContacts, which collapses
        // repeated numbers before creating recipients.
        setEstimatedCount(
          new Set(audience.csvContacts.map((c) => c.phone)).size,
        );
        return;
      } else if (
        audience.type === 'contacts' &&
        audience.contactIds &&
        audience.contactIds.length > 0
      ) {
        // Falls through to the shared exclude-tag pass below rather than
        // returning early: the send path applies excludes to every
        // audience type, so returning the raw pick count here would
        // promise more recipients than actually get the message.
        baseIds = new Set(audience.contactIds);
      } else {
        // Partially-configured audience — wait for the user to finish.
        setEstimatedCount(null);
        return;
      }

      // Apply exclude tags
      let excludeSet: Set<string> | null = null;
      if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
        const { data: excludeRows } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.excludeTagIds);
        excludeSet = new Set((excludeRows ?? []).map((r) => r.contact_id));
      }

      if (baseIds) {
        const effective = [...baseIds].filter(
          (id) => !excludeSet?.has(id),
        );
        setEstimatedCount(effective.length);
      } else {
        // "All" — fetch the total, then subtract exclude set if any.
        const { count } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true });
        const total = count ?? 0;
        setEstimatedCount(excludeSet ? Math.max(0, total - excludeSet.size) : total);
      }
    } finally {
      setLoadingCount(false);
    }
  }, [
    audience.type,
    audience.districts,
    audience.mandals,
    audience.tagIds,
    audience.customField,
    audience.csvContacts,
    audience.contactIds,
    audience.excludeTagIds,
    accountId,
  ]);

  useEffect(() => {
    fetchEstimatedCount();
  }, [fetchEstimatedCount]);

  function toggleTag(tagId: string) {
    const current = audience.tagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, tagIds: updated });
  }

  function toggleExcludeTag(tagId: string) {
    const current = audience.excludeTagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, excludeTagIds: updated });
  }

  function toggleContact(contact: Contact) {
    const current = audience.contactIds ?? [];
    const updated = current.includes(contact.id)
      ? current.filter((id) => id !== contact.id)
      : [...current, contact.id];
    setPickedContacts((prev) =>
      prev.some((p) => p.id === contact.id) ? prev : [...prev, contact],
    );
    onUpdate({ ...audience, type: 'contacts', contactIds: updated });
  }

  function removeContactId(id: string) {
    onUpdate({
      ...audience,
      contactIds: (audience.contactIds ?? []).filter((c) => c !== id),
    });
  }

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(null);
    try {
      const { rows } = parseContactCsv(await file.text());
      if (rows.length === 0) {
        setCsvError(t('selectAudience.errorCsvMissingPhone'));
        onUpdate({ ...audience, type: 'csv', csvContacts: [] });
        return;
      }
      // The shared parser accepts any non-empty cell as a phone (it was
      // written for the import modal, which validates downstream). Here
      // the rows become real contacts and real sends, so junk like "N/A"
      // or a misaligned column must not get through.
      const valid = rows.filter((r) => isValidE164(r.phone));
      const skipped = rows.length - valid.length;
      if (valid.length === 0) {
        setCsvError(t('selectAudience.errorCsvNoValidPhones'));
        onUpdate({ ...audience, type: 'csv', csvContacts: [] });
        return;
      }
      setCsvError(
        skipped > 0 ? t('selectAudience.csvSkippedRows', { count: skipped }) : null,
      );
      onUpdate({
        ...audience,
        type: 'csv',
        csvContacts: valid.map((r) => ({ phone: r.phone, name: r.name })),
      });
    } catch {
      setCsvError(t('selectAudience.errorCsvParse'));
    } finally {
      // Let the same file be re-picked after a fix.
      e.target.value = '';
    }
  }

  function updateCustomField(patch: Partial<CustomFieldFilter>) {
    const prev = audience.customField ?? {
      fieldId: '',
      operator: 'is' as CustomFieldOperator,
      value: '',
    };
    onUpdate({ ...audience, customField: { ...prev, ...patch } });
  }

  function renderMethodCard(option: {
    type: AudienceType;
    label: string;
    description: string;
    icon: typeof Users;
  }) {
    const isSelected = audience.type === option.type;
    const Icon = option.icon;
    return (
      <button
        key={option.type}
        onClick={() =>
          onUpdate({
            ...audience,
            type: option.type,
            // Wipe shape fields from other types to avoid stale
            // config leaking across selections. Geo keeps tagIds:
            // include-tags narrow a geo audience (RPC p_tag_ids).
            tagIds:
              option.type === 'tags' || option.type === 'geo'
                ? audience.tagIds
                : undefined,
            // Geo fields wipe too — otherwise a stale districts/mandals
            // pair rides along into `broadcasts.audience_filter` and the
            // saved record claims a hand-picked send was area-targeted.
            districts: option.type === 'geo' ? audience.districts : undefined,
            mandals: option.type === 'geo' ? audience.mandals : undefined,
            customField:
              option.type === 'custom_field' ? audience.customField : undefined,
            csvContacts:
              option.type === 'csv' ? audience.csvContacts : undefined,
            contactIds:
              option.type === 'contacts' ? audience.contactIds : undefined,
          })
        }
        className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
          isSelected
            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
            : 'border-border bg-card/50 hover:border-border'
        }`}
      >
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isSelected
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{option.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {option.description}
          </p>
        </div>
      </button>
    );
  }

  const isValid =
    // Geo with no district selected means "all districts" — a valid,
    // deliberate choice, so it never blocks Next.
    audience.type === 'geo' ||
    audience.type === 'all' ||
    (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) ||
    (audience.type === 'custom_field' &&
      !!audience.customField?.fieldId &&
      audience.customField.value.length > 0) ||
    (audience.type === 'csv' &&
      audience.csvContacts &&
      audience.csvContacts.length > 0) ||
    (audience.type === 'contacts' &&
      audience.contactIds &&
      audience.contactIds.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('selectAudience.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('selectAudience.subtitle')}
        </p>
      </div>

      {/* Search sits above the method cards and is always visible: the
          "send to this one person" task is the most common reason to be
          on this screen, and hiding it behind a mode card meant staff
          could not find it at all. Picking a result switches the
          audience to `contacts` on its own — no mode to choose first. */}
      <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <label
            htmlFor="contact-search"
            className="block text-sm font-medium text-foreground"
          >
            {t('selectAudience.searchContactsLabel')}
          </label>

          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="contact-search"
              type="text"
              value={contactQuery}
              onChange={(e) => setContactQuery(e.target.value)}
              placeholder={t('selectAudience.searchContactsPlaceholder')}
              className="h-11 w-full rounded-lg border border-border bg-muted pl-9 pr-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {searchingContacts && (
              <>
                <Loader2
                  aria-hidden="true"
                  className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary"
                />
                <span className="sr-only">{t('selectAudience.searching')}</span>
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {t('selectAudience.searchHint')}
          </p>

          {contactQuery.trim().length >= 2 && (
            <div
              role="status"
              aria-live="polite"
              className="max-h-64 overflow-y-auto rounded-lg border border-border"
            >
              {contactResults.length === 0 && !searchingContacts ? (
                <p className="p-3 text-xs text-muted-foreground">
                  {t('selectAudience.noContactsFound')}
                </p>
              ) : (
                contactResults.map((c) => {
                  const isPicked = (audience.contactIds ?? []).includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="checkbox"
                      aria-checked={isPicked}
                      onClick={() => toggleContact(c)}
                      className="flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left last:border-b-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                    >
                      <div
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          isPicked
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border'
                        }`}
                      >
                        {isPicked && <Check className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">
                          {c.name || t('selectAudience.unnamedContact')}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.phone}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {(audience.contactIds ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {(audience.contactIds ?? []).map((id) => {
                const c = pickedContacts.find((p) => p.id === id);
                const label = c?.name || c?.phone || t('selectAudience.loadingContact');
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() => removeContactId(id)}
                      aria-label={t('selectAudience.removeContactNamed', { name: label })}
                      className="rounded-full p-0.5 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
      </div>

      {/* Group-based methods. "By area" stays primary; the bulk/power
          options sit behind the disclosure. */}
      <div>
        <p className="mb-3 text-sm font-medium text-foreground">
          {t('selectAudience.orSendToGroup')}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {primaryOptions.map(renderMethodCard)}
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          aria-controls="advanced-audience-methods"
          className="mt-3 flex items-center gap-1.5 rounded text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
          />
          {t('selectAudience.moreWays')}
        </button>
        {showAdvanced && (
          <div
            id="advanced-audience-methods"
            className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {advancedOptions.map(renderMethodCard)}
          </div>
        )}
      </div>

      {audience.type === 'csv' && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-sm font-medium text-foreground">
            {t('selectAudience.uploadCsv')}
          </p>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/50 px-4 py-8 text-center transition-colors hover:border-primary/50">
            <FileUp className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm text-foreground">
              {t('selectAudience.uploadCsv')}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('selectAudience.csvFormatDesc')}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleCsvFile}
            />
          </label>
          {csvError && <p className="text-xs text-red-400">{csvError}</p>}
          {(audience.csvContacts ?? []).length > 0 && (
            <p className="text-xs text-primary">
              {t('selectAudience.csvContactsFound', {
                count: (audience.csvContacts ?? []).length,
              })}
            </p>
          )}
        </div>
      )}

      {audience.type === 'geo' && (
        <>
          <GeoAudiencePicker
            accountId={accountId}
            districts={audience.districts ?? []}
            mandals={audience.mandals ?? []}
            onChange={({ districts, mandals }) =>
              onUpdate({ ...audience, type: 'geo', districts, mandals })
            }
          />

          {/* Optional include-tags narrowing. Composes with the area
              above via the RPC's p_tag_ids: pick a tag (e.g.
              service-request) to reach only those contacts — across all
              districts when none is selected. */}
          <div className="rounded-xl border border-border bg-card/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Tags className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">
                {t('selectAudience.narrowByTags')}
              </p>
            </div>
            {tags.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('selectAudience.noTagsFound')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const isSelected = audience.tagIds?.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        isSelected
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'border-border bg-muted text-muted-foreground hover:border-border'
                      }`}
                    >
                      <span
                        className="mr-1.5 h-2 w-2 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {audience.type === 'tags' && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="mb-3 text-sm font-medium text-foreground">{t('selectAudience.selectTags')}</p>
          {loadingTags ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('selectAudience.noTagsFound')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = audience.tagIds?.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-muted text-muted-foreground hover:border-border'
                    }`}
                  >
                    <span
                      className="mr-1.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {audience.type === 'custom_field' && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-sm font-medium text-foreground">{t('selectAudience.method.customField')}</p>
          {loadingFields ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : customFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('selectAudience.errorLoadFields')}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
              <select
                value={audience.customField?.fieldId ?? ''}
                onChange={(e) => updateCustomField({ fieldId: e.target.value })}
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">{t('selectAudience.selectField')}</option>
                {customFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.field_name}
                  </option>
                ))}
              </select>
              <select
                value={audience.customField?.operator ?? 'is'}
                onChange={(e) =>
                  updateCustomField({
                    operator: e.target.value as CustomFieldOperator,
                  })
                }
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {OPERATOR_OPTIONS.map((op: { value: CustomFieldOperator; label: string }) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={audience.customField?.value ?? ''}
                onChange={(e) => updateCustomField({ value: e.target.value })}
                placeholder={t('selectAudience.valuePlaceholder')}
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
        </div>
      )}

      {/* Exclude list — applies regardless of audience type */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <X className="h-4 w-4 text-red-400" />
          <p className="text-sm font-medium text-foreground">
            {t('selectAudience.excludeTags')}
          </p>
        </div>
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('selectAudience.noTagsFound')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isExcluded = audience.excludeTagIds?.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleExcludeTag(tag.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    isExcluded
                      ? 'border-red-500/30 bg-red-500/10 text-red-300'
                      : 'border-border bg-muted text-muted-foreground hover:border-border'
                  }`}
                >
                  <span
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Audience Summary — big number so the reach is unmissable. */}
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-primary/30 bg-primary/5 p-4"
      >
        {loadingCount ? (
          <div className="flex items-center gap-2">
            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              {t('selectAudience.counting')}
            </span>
          </div>
        ) : estimatedCount !== null ? (
          <div className="flex items-center gap-3">
            <Users aria-hidden="true" className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground">
                {estimatedCount.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('selectAudience.peopleWillGetIt', { count: estimatedCount })}
              </p>
              {/* A geo audience with nothing picked is not "no filter yet"
                  — it resolves to the entire database. Say so loudly:
                  it is one tap from a send to every contact. */}
              {audience.type === 'geo' && targetsEveryone(audience) && (
                <p className="mt-1 text-xs font-semibold text-amber-500">
                  {t('selectAudience.geoEveryoneWarning')}
                </p>
              )}
              {/* A CSV audience is counted from the file, but excludes are
                  applied at send time against contacts that the upsert
                  creates or matches — so the final number can only be
                  resolved then. Say so rather than show a figure that
                  quietly overstates the reach. */}
              {audience.type === 'csv' &&
                (audience.excludeTagIds ?? []).length > 0 && (
                  <p className="mt-1 text-xs text-amber-500">
                    {t('selectAudience.csvExcludeNote')}
                  </p>
                )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('selectAudience.pickAnOptionHint')}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!isValid}
          className="h-12 px-6 text-base bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
