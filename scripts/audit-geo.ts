/**
 * One-off audit: compare the district recorded in the dealer's
 * spreadsheets against the district derived from the contact's mandal
 * via the post-2022 geography reference. Reports how many contacts the
 * stale district column would mis-target.
 *
 * Run: npx tsx scripts/audit-geo.ts
 */
import { readFileSync } from 'node:fs';
import { normalizeMandal } from '../src/lib/geo/ap-districts';

interface Geo {
  mandal?: string;
  district?: string;
}

const geoMap = new Map<string, Geo>(
  JSON.parse(readFileSync('.playwright-mcp/geo-map.json', 'utf8')),
);

const counts = {
  withMandal: 0,
  resolved: 0,
  unresolved: new Map<string, number>(),
  byDistrict: new Map<string, number>(),
};

for (const [, geo] of geoMap) {
  if (!geo.mandal) continue;
  counts.withMandal++;
  const ref = normalizeMandal(geo.mandal);
  if (!ref) {
    counts.unresolved.set(geo.mandal, (counts.unresolved.get(geo.mandal) ?? 0) + 1);
    continue;
  }
  counts.resolved++;
  counts.byDistrict.set(ref.district, (counts.byDistrict.get(ref.district) ?? 0) + 1);
}

console.log(`phones with a mandal: ${counts.withMandal}`);
console.log(`resolved to canonical mandal: ${counts.resolved}`);
console.log('\nTRUE district distribution (derived from mandal):');
for (const [d, n] of [...counts.byDistrict].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${d}`);
}
console.log('\nunresolved mandal strings:');
for (const [m, n] of [...counts.unresolved].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${m}`);
}
