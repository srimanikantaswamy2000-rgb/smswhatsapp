import { describe, expect, it } from 'vitest';
import {
  AP_DISTRICTS,
  AP_MANDALS,
  mandalsForDistrict,
  normalizeDistrict,
  normalizeMandal,
} from './ap-districts';

describe('AP_DISTRICTS', () => {
  it('lists the 28 districts of the post-2025 reorganisation', () => {
    expect(AP_DISTRICTS).toHaveLength(28);
  });

  it('has no duplicates', () => {
    expect(new Set(AP_DISTRICTS).size).toBe(AP_DISTRICTS.length);
  });
});

describe('AP_MANDALS', () => {
  it('only references known districts', () => {
    for (const mandal of AP_MANDALS) {
      expect(AP_DISTRICTS).toContain(mandal.district);
    }
  });

  it('covers West Godavari and Eluru in full', () => {
    expect(mandalsForDistrict('West Godavari')).toHaveLength(20);
    expect(mandalsForDistrict('Eluru')).toHaveLength(27);
  });
});

describe('normalizeMandal', () => {
  it('is case, spacing and punctuation insensitive', () => {
    expect(normalizeMandal('tadepalligudem')?.name).toBe('Tadepalligudem');
    expect(normalizeMandal('  BHIMAVARAM  ')?.name).toBe('Bhimavaram');
    expect(normalizeMandal('T.NARASAPURAM')?.name).toBe('T. Narasapuram');
    expect(normalizeMandal('T NARASAPURAM')?.name).toBe('T. Narasapuram');
  });

  it('resolves the known misspellings', () => {
    const cases: Record<string, string> = {
      DEVARAPALLLI: 'Devarapalle',
      DEAVARAPALLI: 'Devarapalle',
      BHIMADOLU: 'Bhimadole',
      BHIMAOLE: 'Bhimadole',
      BHIMADOLE: 'Bhimadole',
      DWARAKATIRUMLA: 'Dwaraka Tirumala',
      PALACODRU: 'Palakoderu',
      PALAKODERU: 'Palakoderu',
      PANTAPADU: 'Pentapadu',
      PENTAPADU: 'Pentapadu',
      'T NARASAPUARM': 'T. Narasapuram',
      LINGAMPALEM: 'Lingapalem',
      LINGAPALEM: 'Lingapalem',
      NIDADAVOLE: 'Nidadavole',
      NALLAJERALA: 'Nallajerla',
      VASTAVAI: 'Vatsavai',
      KOYYALGUDEM: 'Koyyalagudem',
      KANCHIKACHARLA: 'Kanchikacherla',
      KOVVURU: 'Kovvur',
      KIRTAMPUDI: 'Kirlampudi',
    };

    for (const [raw, expected] of Object.entries(cases)) {
      expect(normalizeMandal(raw)?.name, raw).toBe(expected);
    }
  });

  it('resolves the C-for-K spelling variants', () => {
    expect(normalizeMandal('PALACOLE')?.name).toBe('Palakollu');
    expect(normalizeMandal('PALAKOLLU')?.name).toBe('Palakollu');
    // Both the 'PALACODRU' and 'PALACODERU' spellings occur in the data.
    expect(normalizeMandal('PALACODERU')?.name).toBe('Palakoderu');
    expect(normalizeMandal('PALACODRU')?.name).toBe('Palakoderu');
    expect(normalizeMandal('PALAKODERU')?.name).toBe('Palakoderu');
  });

  it('resolves mandals added from the merged spreadsheets', () => {
    expect(normalizeMandal('BAPULAPADU')).toEqual({
      name: 'Bapulapadu',
      district: 'Krishna',
    });
    expect(normalizeMandal('IBRAHIMPATNAM')).toEqual({
      name: 'Ibrahimpatnam',
      district: 'NTR',
    });
  });

  it('leaves bare Machilipatnam null — it split into North and South in 2023', () => {
    expect(normalizeMandal('MACHILIPATNAM')).toBeNull();
    expect(normalizeDistrict('MACHILIPATNAM')).toBe('Krishna');
    expect(normalizeMandal('Machilipatnam North')?.district).toBe('Krishna');
    expect(normalizeMandal('Machilipatnam South')?.district).toBe('Krishna');
  });

  it('puts the Kovvur division in East Godavari, not West Godavari', () => {
    expect(normalizeMandal('UNDRAJAVARAM')?.district).toBe('East Godavari');
    expect(normalizeMandal('NIDADAVOLE')?.district).toBe('East Godavari');
    expect(normalizeMandal('CHAGALLU')?.district).toBe('East Godavari');
  });

  it('resolves the ambiguous Unguturu to the Eluru mandal (the catchment)', () => {
    expect(normalizeMandal('UNGUTURU')?.district).toBe('Eluru');
  });

  it('returns null for junk and for non-mandal place names', () => {
    expect(normalizeMandal('MUMBAI')).toBeNull();
    expect(normalizeMandal('VIJAYAWADA')).toBeNull();
    expect(normalizeMandal('KRISHNA')).toBeNull();
    expect(normalizeMandal('LAKSHMIPURAM')).toBeNull();
    expect(normalizeMandal('')).toBeNull();
  });
});

describe('normalizeDistrict', () => {
  it('accepts an old district name', () => {
    expect(normalizeDistrict('West Godavari')).toBe('West Godavari');
    expect(normalizeDistrict('nellore')).toBe('Sri Potti Sriramulu Nellore');
    expect(normalizeDistrict('Anantapur')).toBe('Ananthapuramu');
  });

  it('accepts a new district name', () => {
    expect(normalizeDistrict('NTR')).toBe('NTR');
    expect(normalizeDistrict('eluru')).toBe('Eluru');
  });

  it('maps a city to the district that covers it', () => {
    expect(normalizeDistrict('VIJAYAWADA')).toBe('NTR');
    expect(normalizeDistrict('VISAKHAPATAM')).toBe('Visakhapatnam');
  });

  it('returns null for junk', () => {
    expect(normalizeDistrict('MUMBAI')).toBeNull();
  });
});

describe('mandalsForDistrict', () => {
  it('returns sorted mandals for the district', () => {
    const names = mandalsForDistrict('East Godavari').map((m) => m.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toContain('Undrajavaram');
  });

  it('returns empty for an unknown district', () => {
    expect(mandalsForDistrict('Nowhere')).toEqual([]);
  });
});
