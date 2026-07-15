// ============================================================
// Template variable resolution for broadcasts.
//
// Extracted from `use-broadcast-sending` so the server-side sender
// (and its cron) resolve variables identically to the wizard preview —
// one implementation, one set of tests.
//
// Meta's parameter rules (the reason `sanitizeParam` exists):
//   - a parameter may not be empty
//   - it may not contain newlines or tabs
//   - it may not contain more than 4 consecutive spaces
// Violating any of these fails the send for that recipient, so a
// messy imported name ("Ramu\n Garu") must never reach the API raw.
// ============================================================

export type VariableMapping =
  | { type: 'static'; value: string }
  | { type: 'field'; value: string; fallback?: string }
  | { type: 'custom_field'; value: string; fallback?: string };

/** Used when a mapping has no explicit fallback and the value is
 *  missing. Never blank — an empty parameter fails the send. */
export const DEFAULT_FALLBACK = 'Sir/Madam';

export interface ContactLike {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  district?: string | null;
  mandal?: string | null;
}

/**
 * Make a value safe to send as a WhatsApp template parameter:
 * newlines/tabs become spaces, runs of whitespace collapse to a single
 * space (which also satisfies the "no more than 4 consecutive spaces"
 * rule), and the result is trimmed.
 */
export function sanitizeParam(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Resolve one mapping against a contact. Returns the fallback whenever
 * the source value is missing or blank after sanitisation, so the
 * result is always a non-empty string Meta will accept.
 */
export function resolveVariable(
  mapping: VariableMapping,
  contact: ContactLike,
  customValues?: Map<string, string>,
): string {
  if (mapping.type === 'static') {
    // A static value is authored by the user, not imported — but it
    // still has to satisfy Meta's rules.
    return sanitizeParam(mapping.value) || DEFAULT_FALLBACK;
  }

  const raw =
    mapping.type === 'field'
      ? fieldValue(contact, mapping.value)
      : customValues?.get(mapping.value);

  const clean = sanitizeParam(raw ?? '');
  if (clean) return clean;
  return sanitizeParam(mapping.fallback ?? '') || DEFAULT_FALLBACK;
}

function fieldValue(contact: ContactLike, field: string): string | undefined {
  const map: Record<string, string | null | undefined> = {
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    company: contact.company,
    district: contact.district,
    mandal: contact.mandal,
  };
  return map[field] ?? undefined;
}

/**
 * Resolve every mapping into the positional array Meta expects.
 * Keys are "1", "2", … — sorted numerically so {{2}} precedes {{10}}.
 */
export function resolveVariables(
  variables: Record<string, VariableMapping>,
  contact: ContactLike,
  customValues?: Map<string, string>,
): string[] {
  return Object.keys(variables)
    .sort((a, b) => {
      const an = Number(a);
      const bn = Number(b);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return a.localeCompare(b);
    })
    .map((key) => resolveVariable(variables[key], contact, customValues));
}
