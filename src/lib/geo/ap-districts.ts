/**
 * Andhra Pradesh geography reference for broadcast targeting dropdowns.
 *
 * Sources (verified July 2026):
 * - Districts: https://en.wikipedia.org/wiki/List_of_districts_of_Andhra_Pradesh
 *   AP went 13 -> 26 districts on 4 April 2022, then 26 -> 28 on 31 December 2025
 *   (Markapuram and Polavaram districts added; notification in force 1 January 2026).
 *   This module therefore lists 28 districts, not the 26 of the 2022 reorganisation.
 * - East Godavari mandals: https://eastgodavari.ap.gov.in/mandals/
 * - Eluru mandals: https://eluru.ap.gov.in/mandal/
 * - West Godavari (20 mandals, 3 revenue divisions):
 *   https://en.wikipedia.org/wiki/West_Godavari_district
 *
 * Two results that routinely surprise people, both confirmed on the official
 * district sites above:
 * - The Kovvur revenue division (Undrajavaram, Nidadavole, Kovvur, Chagallu,
 *   Peravali, Tallapudi, Devarapalle, Gopalapuram, Nallajerla) sits in EAST
 *   Godavari, not West Godavari, despite being west of the river.
 * - Polavaram *mandal* is in Eluru district; the new Polavaram *district* is
 *   headquartered at Rampachodavaram and was carved out of Alluri Sitharama Raju.
 */

/** The 28 districts of Andhra Pradesh (post-2025 reorganisation). */
export const AP_DISTRICTS: readonly string[] = [
  'Alluri Sitharama Raju',
  'Anakapalli',
  'Ananthapuramu',
  'Annamayya',
  'Bapatla',
  'Chittoor',
  'Dr. B. R. Ambedkar Konaseema',
  'East Godavari',
  'Eluru',
  'Guntur',
  'Kakinada',
  'Krishna',
  'Kurnool',
  'Markapuram',
  'Nandyal',
  'NTR',
  'Palnadu',
  'Parvathipuram Manyam',
  'Polavaram',
  'Prakasam',
  'Srikakulam',
  'Sri Potti Sriramulu Nellore',
  'Sri Sathya Sai',
  'Tirupati',
  'Visakhapatnam',
  'Vizianagaram',
  'West Godavari',
  'YSR Kadapa',
];

export interface MandalRef {
  /** Canonical display name, Title Case */
  name: string;
  /** One of AP_DISTRICTS */
  district: string;
}

/**
 * Mandal names per district. West Godavari and Eluru are listed in full (the
 * dealer's core catchment, so the dropdown stays complete for future contacts);
 * other districts carry only the mandals seen in the imported contact data.
 *
 * Order matters: Eluru precedes Krishna so that the duplicate mandal name
 * "Unguturu" (one in each) resolves to the Eluru one. See buildLookup below.
 */
const MANDALS_BY_DISTRICT: Record<string, string[]> = {
  'West Godavari': [
    'Achanta',
    'Akiveedu',
    'Attili',
    'Bhimavaram',
    'Ganapavaram',
    'Iragavaram',
    'Kalla',
    'Mogalthur',
    'Narasapuram',
    'Palakoderu',
    'Palakollu',
    'Pentapadu',
    'Penugonda',
    'Penumantra',
    'Poduru',
    'Tadepalligudem',
    'Tanuku',
    'Undi',
    'Veeravasaram',
    'Yelamanchili',
  ],
  Eluru: [
    'Agiripalli',
    'Bhimadole',
    'Buttayagudem',
    'Chatrai',
    'Chintalapudi',
    'Denduluru',
    'Dwaraka Tirumala',
    'Eluru',
    'Jangareddygudem',
    'Jeelugumilli',
    'Kaikaluru',
    'Kalidindi',
    'Kamavarapukota',
    'Koyyalagudem',
    'Kukunuru',
    'Lingapalem',
    'Mandavalli',
    'Mudinepalli',
    'Musunuru',
    'Nidamarru',
    'Nuzvid',
    'Pedapadu',
    'Pedavegi',
    'Polavaram',
    'T. Narasapuram',
    'Unguturu',
    'Velairpadu',
  ],
  'East Godavari': [
    'Chagallu',
    'Devarapalle',
    'Gopalapuram',
    'Kovvur',
    'Nallajerla',
    'Nidadavole',
    'Peravali',
    'Seethanagaram',
    'Tallapudi',
    'Undrajavaram',
  ],
  Krishna: [
    'Avanigadda',
    'Bapulapadu',
    'Challapalli',
    'Gudivada',
    'Gudlavalleru',
    'Guduru',
    'Kankipadu',
    // Machilipatnam mandal was split into North and South on 8 May 2023, so a
    // bare "Machilipatnam" cannot resolve to one mandal — it maps to the
    // district only, like Vijayawada.
    'Machilipatnam North',
    'Machilipatnam South',
    'Mopidevi',
    'Nagayalanka',
    'Penamaluru',
    'Thotlavalluru',
    'Unguturu',
    'Vuyyuru',
  ],
  NTR: [
    'A. Konduru',
    'Ibrahimpatnam',
    'Jaggayyapeta',
    'Kanchikacherla',
    'Mylavaram',
    'Penuganchiprolu',
    'Tiruvuru',
    'Vatsavai',
    'Veerullapadu',
  ],
  Annamayya: ['Nimmanapalle', 'Ramasamudram', 'Sodam'],
  'Dr. B. R. Ambedkar Konaseema': ['Mummidivaram', 'Ramachandrapuram'],
  Kakinada: ['Kirlampudi'],
  Bapatla: ['Bapatla'],
};

/** Canonical mandals we serve, grouped for dropdowns. */
export const AP_MANDALS: readonly MandalRef[] = Object.entries(
  MANDALS_BY_DISTRICT
).flatMap(([district, names]) => names.map((name) => ({ name, district })));

/** Lookup key: strip everything but letters and digits, uppercase. */
function key(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Misspellings and spelling variants seen in the imported contact data,
 * mapped to the canonical mandal name.
 */
const MANDAL_ALIASES: Record<string, string> = {
  BHIMADOLU: 'Bhimadole',
  BHIMAOLE: 'Bhimadole',
  DEVARAPALLI: 'Devarapalle',
  DEVARAPALLLI: 'Devarapalle',
  DEAVARAPALLI: 'Devarapalle',
  DWARAKATIRUMLA: 'Dwaraka Tirumala',
  // 'Palacole' is the anglicised spelling of Palakollu used in English
  // writings; the C-for-K swap recurs across these names.
  PALACOLE: 'Palakollu',
  PALAKOL: 'Palakollu',
  PALACODERU: 'Palakoderu',
  PALACODRU: 'Palakoderu',
  PALAKODRU: 'Palakoderu',
  PANTAPADU: 'Pentapadu',
  TNARASAPUARM: 'T. Narasapuram',
  TNARSAPURAM: 'T. Narasapuram',
  LINGAMPALEM: 'Lingapalem',
  NIDADAVOLU: 'Nidadavole',
  NALLAJERALA: 'Nallajerla',
  VASTAVAI: 'Vatsavai',
  KOYYALGUDEM: 'Koyyalagudem',
  KANCHIKACHARLA: 'Kanchikacherla',
  KOVVURU: 'Kovvur',
  AKIVIDU: 'Akiveedu',
  MOGALTURU: 'Mogalthur',
  MOGALTUR: 'Mogalthur',
  KUKUNOOR: 'Kukunuru',
  KAIKALUR: 'Kaikaluru',
  BUTTAIGUDEM: 'Buttayagudem',
  NUZVEED: 'Nuzvid',
  NUZVIDU: 'Nuzvid',
  NIDAMARU: 'Nidamarru',
  SEETANAGARAM: 'Seethanagaram',
  SITANAGARAM: 'Seethanagaram',
  NIMMANAPALLI: 'Nimmanapalle',
  KIRTAMPUDI: 'Kirlampudi',
  // The dealer's Rayalaseema contacts cluster around Madanapalle, where the
  // mandal is officially spelled Sodam.
  SADUM: 'Sodam',
};

function buildLookup(): Map<string, MandalRef> {
  const lookup = new Map<string, MandalRef>();
  // First entry wins, so MANDALS_BY_DISTRICT's ordering decides duplicates.
  for (const mandal of AP_MANDALS) {
    const k = key(mandal.name);
    if (!lookup.has(k)) lookup.set(k, mandal);
  }
  for (const [alias, name] of Object.entries(MANDAL_ALIASES)) {
    const target = lookup.get(key(name));
    if (target) lookup.set(alias, target);
  }
  return lookup;
}

const MANDAL_LOOKUP = buildLookup();

/**
 * Normalise a raw free-text mandal string from imported data to a
 * canonical MandalRef, or null when it isn't a recognisable mandal.
 * Case/spacing/punctuation-insensitive; handles the known misspellings.
 */
export function normalizeMandal(raw: string): MandalRef | null {
  return MANDAL_LOOKUP.get(key(raw)) ?? null;
}

/**
 * Old (pre-2022) district names and common city names, mapped to the district
 * that covers them today. Districts whose name did not change need no entry.
 */
const DISTRICT_ALIASES: Record<string, string> = {
  NELLORE: 'Sri Potti Sriramulu Nellore',
  SPSNELLORE: 'Sri Potti Sriramulu Nellore',
  KADAPA: 'YSR Kadapa',
  YSR: 'YSR Kadapa',
  CUDDAPAH: 'YSR Kadapa',
  ANANTAPUR: 'Ananthapuramu',
  ANANTHAPUR: 'Ananthapuramu',
  KONASEEMA: 'Dr. B. R. Ambedkar Konaseema',
  // Cities that people write instead of the district they sit in.
  VIJAYAWADA: 'NTR',
  RAJAHMUNDRY: 'East Godavari',
  RAJAMAHENDRAVARAM: 'East Godavari',
  MACHILIPATNAM: 'Krishna',
  AMALAPURAM: 'Dr. B. R. Ambedkar Konaseema',
  VISAKHAPATAM: 'Visakhapatnam',
  VIZAG: 'Visakhapatnam',
};

const DISTRICT_LOOKUP = new Map<string, string>([
  ...AP_DISTRICTS.map((d) => [key(d), d] as const),
  ...Object.entries(DISTRICT_ALIASES).map(([k, d]) => [k, d] as const),
]);

/** Normalise a raw free-text district string (old or new name) to a new district, or null. */
export function normalizeDistrict(raw: string): string | null {
  return DISTRICT_LOOKUP.get(key(raw)) ?? null;
}

/** Mandals belonging to a district, sorted — for the dropdown. */
export function mandalsForDistrict(district: string): MandalRef[] {
  return AP_MANDALS.filter((m) => m.district === district).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
