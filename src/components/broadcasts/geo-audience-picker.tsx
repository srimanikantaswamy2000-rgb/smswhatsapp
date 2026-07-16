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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

const ALL_DISTRICTS = '__all__';

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

  const selectedDistrict = districts[0] ?? ALL_DISTRICTS;

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

  /** Mandals inside the chosen district. Empty when "all districts". */
  const mandalOptions = useMemo(() => {
    if (selectedDistrict === ALL_DISTRICTS) return [];
    return rows
      .filter((r) => r.district === selectedDistrict && r.mandal)
      .map((r) => [r.mandal as string, Number(r.contact_count)] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, selectedDistrict]);

  /** Contacts in this district that have no mandal on file — they are
   *  reachable by district but NOT by any mandal selection. Saying so
   *  prevents "why did only 40 of my 155 customers get it?". */
  const noMandalCount = useMemo(() => {
    if (selectedDistrict === ALL_DISTRICTS) return 0;
    const row = rows.find((r) => r.district === selectedDistrict && !r.mandal);
    return row ? Number(row.contact_count) : 0;
  }, [rows, selectedDistrict]);

  function pickDistrict(value: string) {
    if (value === ALL_DISTRICTS) onChange({ districts: [], mandals: [] });
    else onChange({ districts: [value], mandals: [] }); // mandals reset with the district
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
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          District
        </label>
        <Select value={selectedDistrict} onValueChange={(v) => pickDistrict(v ?? ALL_DISTRICTS)}>
          <SelectTrigger className="w-full border-border bg-muted text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover">
            <SelectItem value={ALL_DISTRICTS}>
              All districts
              <span className="ml-1.5 text-xs text-muted-foreground">
                {totalContacts} customers
              </span>
            </SelectItem>
            {districtOptions.map(([name, count]) => (
              <SelectItem key={name} value={name}>
                {name}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {count}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedDistrict !== ALL_DISTRICTS && (
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
              {selectedDistrict} have no mandal recorded and will NOT be
              included while mandals are selected. Clear the mandals to reach
              the whole district.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
