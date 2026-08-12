/**
 * Helpers for building PostgREST `or=(...)` filter arguments safely.
 *
 * PostgREST splits the or-argument on commas and treats parentheses as
 * grouping, so interpolating raw user input produces malformed
 * conditions and a 400 — which surfaces to the user as an empty result
 * set rather than an error. Double-quoting the value makes those
 * characters literal.
 */

/**
 * Wrap a value for use inside a PostgREST `or=(...)` filter.
 *
 * Backslashes must be escaped before quotes, or the escape character
 * itself gets doubled incorrectly.
 *
 * @example
 *   `name.ilike.${orLiteral(`%${term}%`)}`
 */
export function orLiteral(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
