'use client';

// ============================================================
// District / mandal audience picker.
//
// The dealership targets geographically ("harvester promotions for
// Tanuku"), so this is the primary way to choose an audience — tags
// are the advanced fallback.
//
// Options come from `contact_geo_options`, which returns the
// district/mandal pairs the account ACTUALLY has contacts in (with
// counts). We never show the full 28-district / 90-mandal reference
// list: a dropdown full of districts with zero customers is noise.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, MapPin } from 'lucide-react';

interface GeoRow {
  district: string;
  mandal: string | null;
  contact_count: number;
}

interface GeoAudiencePickerProps {
  accountId: string | null;
  districts: string[];
  mandals: string[];
  onChange: (next: { districts: string[]; mandals: string[] }) => void;
}

export function GeoAudiencePicker({
  accountId,
  districts,
  mandals,
  onChange,
}: GeoAudiencePickerProps) {
  const [rows, setRows] = useState<GeoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase.rpc('contact_geo_options', {
        p_account_id: accountId,
      });
      if (cancelled) return;
      setRows((data ?? []) as GeoRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  /** Districts with a customer count, biggest first. */
  const districtOptions = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of rows) {
      totals.set(r.district, (totals.get(r.district) ?? 0) + Number(r.contact_count));
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const totalContacts = useMemo(
    () => districtOptions.reduce((sum, [, n]) => sum + n, 0),
    [districtOptions],
  );

  const selectedTotal = useMemo(() => {
    if (districts.length === 0) return totalContacts;
    return districtOptions
      .filter(([name]) => districts.includes(name))
      .reduce((sum, [, n]) => sum + n, 0);
  }, [districts, districtOptions, totalContacts]);

  /** Mandals are district-specific, so they only make sense when exactly
   *  one district is selected. With zero ("all") or several districts we
   *  target whole districts and hide the mandal narrowing entirely. */
  const singleDistrict = districts.length === 1 ? districts[0] : null;

  const mandalOptions = useMemo(() => {
    if (!singleDistrict) return [];
    return rows
      .filter((r) => r.district === singleDistrict && r.mandal)
      .map((r) => [r.mandal as string, Number(r.contact_count)] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, singleDistrict]);

  /** Contacts in this district that have no mandal on file — they are
   *  reachable by district but NOT by any mandal selection. Saying so
   *  prevents "why did only 40 of my 155 customers get it?". */
  const noMandalCount = useMemo(() => {
    if (!singleDistrict) return 0;
    const row = rows.find((r) => r.district === singleDistrict && !r.mandal);
    return row ? Number(row.contact_count) : 0;
  }, [rows, singleDistrict]);

  function toggleDistrict(name: string) {
    const next = districts.includes(name)
      ? districts.filter((d) => d !== name)
      : [...districts, name];
    // Mandals belong to a single district, so any change that leaves us
    // with a count other than one district invalidates the selection.
    onChange({ districts: next, mandals: next.length === 1 ? mandals : [] });
  }

  function toggleMandal(name: string) {
    const next = mandals.includes(name)
      ? mandals.filter((m) => m !== name)
      : [...mandals, name];
    onChange({ districts, mandals: next });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card/50 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading districts…
      </div>
    );
  }

  if (districtOptions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-4 text-sm text-muted-foreground">
        No contacts have a district yet. Import contacts with a district or
        mandal column to target by area.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-xs font-medium text-muted-foreground">
            Districts{' '}
            {districts.length === 0 ? (
              <span className="font-semibold text-amber-500">
                — none picked: EVERY contact ({totalContacts.toLocaleString()})
              </span>
            ) : (
              `— ${districts.length} selected · ${selectedTotal.toLocaleString()} contacts`
            )}
          </label>
          {districts.length > 0 && (
            <button
              type="button"
              onClick={() => onChange({ districts: [], mandals: [] })}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {/* Was labelled "All districts", which reads as "select
                  them all" but actually clears the selection — and an
                  empty selection means EVERY contact. That mislabel is
                  one tap away from a send to the whole database. */}
              Clear selection
            </button>
          )}
        </div>
        {/* Multi-select: pick one, several, or none. None = every
            district (the RPC treats an empty p_districts as "no
            constraint"). */}
        <div className="flex flex-wrap gap-2">
          {districtOptions.map(([name, count]) => {
            const on = districts.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleDistrict(name)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  on
                    ? 'border-primary bg-primary/20 text-primary'
                    : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {name}
                <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {districts.length === 0
            ? `All districts · ${totalContacts} customers`
            : `${selectedTotal} customers in ${districts.length} district${districts.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {singleDistrict && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium text-muted-foreground">
              Mandals{' '}
              {mandals.length === 0
                ? '— all in this district'
                : `— ${mandals.length} selected`}
            </label>
            {mandals.length > 0 && (
              <button
                type="button"
                onClick={() => onChange({ districts, mandals: [] })}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {mandalOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No mandals recorded for this district — the whole district will be
              targeted.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {mandalOptions.map(([name, count]) => {
                const on = mandals.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleMandal(name)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                      on
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <MapPin className="h-3 w-3" />
                    {name}
                    <span className="opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {noMandalCount > 0 && mandals.length > 0 && (
            <p className="mt-2 text-xs text-amber-300">
              {noMandalCount} customer{noMandalCount === 1 ? '' : 's'} in{' '}
              {singleDistrict} have no mandal recorded and will NOT be
              included while mandals are selected. Clear the mandals to reach
              the whole district.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
