import { describe, expect, it } from 'vitest';
import { orLiteral } from './or-filter';

describe('orLiteral', () => {
  it('wraps a plain value in double quotes', () => {
    expect(orLiteral('%Vashida%')).toBe('"%Vashida%"');
  });

  it('keeps a comma literal instead of splitting the or-argument', () => {
    // The bug this exists to prevent: `Rao, K` used to produce
    // `name.ilike.%Rao, K%,phone.ilike.%Rao, K%`, which PostgREST parses
    // as three malformed conditions and rejects with a 400 — the user
    // just saw "nobody matches" for a contact who exists.
    const filter = `name.ilike.${orLiteral('%Rao, K%')}`;
    expect(filter).toBe('name.ilike."%Rao, K%"');
  });

  it('keeps parentheses literal', () => {
    expect(orLiteral('%Kumar (Jr)%')).toBe('"%Kumar (Jr)%"');
  });

  it('escapes embedded double quotes', () => {
    expect(orLiteral('%say "hi"%')).toBe('"%say \\"hi\\"%"');
  });

  it('escapes backslashes before quotes so the escape is not doubled', () => {
    expect(orLiteral('a\\b')).toBe('"a\\\\b"');
    expect(orLiteral('a\\"b')).toBe('"a\\\\\\"b"');
  });

  it('handles an empty value', () => {
    expect(orLiteral('')).toBe('""');
  });
});
