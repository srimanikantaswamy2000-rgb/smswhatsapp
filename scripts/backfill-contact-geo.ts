/**
 * One-off backfill: populate contacts.district / contacts.mandal.
 *
 * Why district is NOT copied from the imported district column
 * -----------------------------------------------------------
 * The dealer's spreadsheets predate the 4 Apr 2022 AP reorganisation.
 * They record the Kovvur revenue division (Undrajavaram, Nidadavole,
 * Kovvur, Chagallu, Peravali, Tallapudi, Gopalapuram, Devarapalle,
 * Nallajerla) as "West Godavari" — those mandals are now EAST Godavari.
 * So wherever a mandal is known, the district is DERIVED from it via
 * `normalizeMandal`. The imported district string is only a fallback
 * for contacts whose mandal we never learned, and is itself run through
 * `normalizeDistrict` to map old names onto the current 28.
 *
 * Sources (matched on normalised phone):
 *   - .playwright-mcp/geo-map.json  — phone -> raw mandal, merged from
 *     all six sheets of the dealer's spreadsheets
 *   - manikanta_customers_whatsapp_import.xlsx — phone -> district
 *
 * Usage:
 *   npx tsx scripts/backfill-contact-geo.ts            # dry run
 *   npx tsx scripts/backfill-contact-geo.ts --apply    # write
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { config } from 'dotenv';

import { normalizeDistrict, normalizeMandal } from '../src/lib/geo/ap-districts';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const IMPORT_XLSX = 'C:/Users/DELL/Documents/manikanta_customers_whatsapp_import.xlsx';
const GEO_MAP = '.playwright-mcp/geo-map.json';

/** Same normalisation the import used: digits only, India country code. */
function normPhone(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith('91')) return d;
  return d.length >= 10 ? d.slice(-10).padStart(12, '91') : null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing from .env.local');
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Fail fast (and clearly) if migration 041 hasn't been applied.
  const probe = await db.from('contacts').select('id, district, mandal').limit(1);
  if (probe.error) {
    throw new Error(
      `contacts.district/mandal not queryable — run migration 041 first. (${probe.error.message})`,
    );
  }

  // phone -> raw mandal string, from the merged spreadsheets.
  const rawGeo = new Map<string, { mandal?: string; district?: string }>(
    JSON.parse(readFileSync(GEO_MAP, 'utf8')),
  );

  // phone -> imported district string (fallback when mandal unknown).
  const importedDistrict = new Map<string, string>();
  const wb = new ExcelJS.Workbook();
  // Copy into a standalone ArrayBuffer — a Node Buffer is a view over a
  // pooled allocation, which exceljs's types reject.
  await wb.xlsx.load(Uint8Array.from(readFileSync(IMPORT_XLSX)).buffer);
  wb.worksheets[0].eachRow((row, n) => {
    if (n === 1) return;
    const phone = normPhone(row.getCell(1).text);
    const district = row.getCell(4).text.trim();
    if (phone && district) importedDistrict.set(phone, district);
  });

  const { data: contacts, error } = await db
    .from('contacts')
    .select('id, phone, name')
    .limit(5000);
  if (error) throw error;

  const updates: { id: string; district: string | null; mandal: string | null }[] = [];
  const stats = {
    total: 0,
    fromMandal: 0,
    fromImportedDistrict: 0,
    none: 0,
    corrected: 0,
    byDistrict: new Map<string, number>(),
  };

  for (const c of contacts ?? []) {
    stats.total++;
    const phone = normPhone(c.phone);
    let district: string | null = null;
    let mandal: string | null = null;

    const rawMandal = phone ? rawGeo.get(phone)?.mandal : undefined;
    const ref = rawMandal ? normalizeMandal(rawMandal) : null;

    if (ref) {
      // Authoritative: the mandal decides the district.
      mandal = ref.name;
      district = ref.district;
      stats.fromMandal++;
      const stale = phone ? importedDistrict.get(phone) : undefined;
      const staleNorm = stale ? normalizeDistrict(stale) : null;
      if (staleNorm && staleNorm !== district) stats.corrected++;
    } else if (phone && importedDistrict.has(phone)) {
      // No mandal known — best effort from the imported district.
      district = normalizeDistrict(importedDistrict.get(phone)!);
      if (district) stats.fromImportedDistrict++;
      else stats.none++;
    } else {
      stats.none++;
    }

    if (district) {
      stats.byDistrict.set(district, (stats.byDistrict.get(district) ?? 0) + 1);
    }
    if (district || mandal) updates.push({ id: c.id, district, mandal });
  }

  console.log(`contacts scanned:            ${stats.total}`);
  console.log(`district derived from mandal: ${stats.fromMandal}`);
  console.log(`  of which district CORRECTED: ${stats.corrected}  <- stale imported value`);
  console.log(`district from imported column: ${stats.fromImportedDistrict}`);
  console.log(`no geo at all:                ${stats.none}`);
  console.log('\nresulting district distribution:');
  for (const [d, n] of [...stats.byDistrict].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${d}`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — ${updates.length} contacts would be updated. Re-run with --apply.`);
    return;
  }

  let written = 0;
  for (const u of updates) {
    const { error: upErr } = await db
      .from('contacts')
      .update({ district: u.district, mandal: u.mandal })
      .eq('id', u.id);
    if (upErr) {
      console.error(`  failed ${u.id}: ${upErr.message}`);
      continue;
    }
    written++;
    if (written % 200 === 0) console.log(`  ...${written}`);
  }
  console.log(`\nwrote ${written}/${updates.length} contacts.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
