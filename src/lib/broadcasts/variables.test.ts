import { describe, expect, it } from 'vitest';
import {
  BINDABLE_FIELDS,
  DEFAULT_FALLBACK,
  defaultFallback,
  resolveVariable,
  resolveVariables,
  sanitizeParam,
} from './variables';

const contact = {
  name: 'Ramu',
  phone: '+919876543210',
  company: 'Ramu Farms',
  village: 'Vadisaleru',
  district: 'East Godavari',
  mandal: 'Undrajavaram',
};

describe('sanitizeParam', () => {
  it('collapses newlines and tabs that Meta rejects', () => {
    expect(sanitizeParam('Ramu\nGaru\tK')).toBe('Ramu Garu K');
  });

  it('collapses long space runs (Meta allows at most 4)', () => {
    expect(sanitizeParam('Ramu          Garu')).toBe('Ramu Garu');
  });

  it('trims', () => {
    expect(sanitizeParam('  Ramu  ')).toBe('Ramu');
  });
});

describe('resolveVariable', () => {
  it('resolves a contact field', () => {
    expect(resolveVariable({ type: 'field', value: 'name' }, contact)).toBe('Ramu');
  });

  it('uses the fallback when the field is missing', () => {
    expect(
      resolveVariable(
        { type: 'field', value: 'name', fallback: 'రైతు గారు' },
        { name: null },
      ),
    ).toBe('రైతు గారు');
  });

  it('uses the fallback when the field is blank/whitespace', () => {
    expect(
      resolveVariable(
        { type: 'field', value: 'name', fallback: 'Sir/Madam' },
        { name: '   ' },
      ),
    ).toBe('Sir/Madam');
  });

  it('never returns an empty string, even with no fallback given', () => {
    expect(resolveVariable({ type: 'field', value: 'name' }, { name: '' })).toBe(
      DEFAULT_FALLBACK,
    );
  });

  it('never returns empty when the fallback itself is blank', () => {
    expect(
      resolveVariable({ type: 'field', value: 'name', fallback: '  ' }, { name: '' }),
    ).toBe(DEFAULT_FALLBACK);
  });

  it('sanitises a messy imported name', () => {
    expect(
      resolveVariable({ type: 'field', value: 'name' }, { name: 'Ramu\n Garu' }),
    ).toBe('Ramu Garu');
  });

  it('resolves geo fields', () => {
    expect(resolveVariable({ type: 'field', value: 'mandal' }, contact)).toBe(
      'Undrajavaram',
    );
    expect(resolveVariable({ type: 'field', value: 'village' }, contact)).toBe(
      'Vadisaleru',
    );
    expect(resolveVariable({ type: 'field', value: 'district' }, contact)).toBe(
      'East Godavari',
    );
  });

  it('builds the dealer\'s sentence: name + place from the database', () => {
    // "నమస్తే రాకేష్ గారు! మీ ఊరు Tanuku కి harvester promotions ఉన్నాయి"
    const vars = {
      '1': { type: 'field' as const, value: 'name', fallback: 'రైతు గారు' },
      '2': { type: 'field' as const, value: 'mandal', fallback: 'మీ మండలం' },
    };
    expect(
      resolveVariables(vars, { name: 'Rakesh', mandal: 'Tanuku' }),
    ).toEqual(['Rakesh', 'Tanuku']);
    // a customer with no mandal still gets a sendable message
    expect(resolveVariables(vars, { name: 'Rakesh' })).toEqual([
      'Rakesh',
      'మీ మండలం',
    ]);
  });

  it('resolves a custom field, falling back when absent', () => {
    const custom = new Map([['crop', 'Paddy']]);
    expect(
      resolveVariable({ type: 'custom_field', value: 'crop' }, contact, custom),
    ).toBe('Paddy');
    expect(
      resolveVariable(
        { type: 'custom_field', value: 'acreage', fallback: 'N/A' },
        contact,
        custom,
      ),
    ).toBe('N/A');
  });

  it('keeps a static value but sanitises it', () => {
    expect(resolveVariable({ type: 'static', value: '31  August' }, contact)).toBe(
      '31 August',
    );
  });
});

describe('defaultFallback', () => {
  it('gives Telugu fallbacks for a te template', () => {
    expect(defaultFallback('name', 'te')).toBe('రైతు గారు');
    expect(defaultFallback('mandal', 'te')).toBe('మీ మండలం');
  });

  it('gives English fallbacks for en / en_US', () => {
    expect(defaultFallback('name', 'en')).toBe('Sir/Madam');
    expect(defaultFallback('name', 'en_US')).toBe('Sir/Madam');
  });

  it('falls back to the generic default for an unknown field', () => {
    expect(defaultFallback('crop', 'en')).toBe(DEFAULT_FALLBACK);
  });

  it('every bindable field has a fallback in both languages', () => {
    for (const f of BINDABLE_FIELDS) {
      expect(defaultFallback(f.value, 'en')).toBeTruthy();
      expect(defaultFallback(f.value, 'te')).toBeTruthy();
    }
  });
});

describe('resolveVariables', () => {
  it('orders numerically so {{2}} precedes {{10}}', () => {
    const vars = {
      '10': { type: 'static' as const, value: 'ten' },
      '2': { type: 'static' as const, value: 'two' },
      '1': { type: 'field' as const, value: 'name' },
    };
    expect(resolveVariables(vars, contact)).toEqual(['Ramu', 'two', 'ten']);
  });

  it('produces no empty entries for a nameless contact', () => {
    const vars = { '1': { type: 'field' as const, value: 'name', fallback: 'రైతు గారు' } };
    expect(resolveVariables(vars, { name: null })).toEqual(['రైతు గారు']);
  });
});
