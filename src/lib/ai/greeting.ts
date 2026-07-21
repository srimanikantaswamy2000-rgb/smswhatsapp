// ============================================================
// "Bare greeting" detection.
//
// A first inbound that is JUST a greeting ("hi", "namaste", "menu")
// carries no intent to act on — the welcome greeting+menu is the right
// reply and the AI stands down. But a first inbound with real content
// ("my DC-68G won't start", "harvester price?") must be PROCESSED by the
// AI, not answered with a generic menu. This decides which case we're in.
// ============================================================

const GREETING_WORDS = new Set([
  // English / Roman
  'hi', 'hii', 'hiii', 'hello', 'helo', 'hey', 'hai', 'hay', 'hlo', 'yo',
  'namaste', 'namasthe', 'namaskaram', 'namaskar', 'nmste', 'vanakkam',
  'menu', 'start', 'begin', 'good morning', 'good evening', 'gm',
  // Telugu
  'హాయ్', 'హలో', 'హెలో', 'నమస్తే', 'నమస్కారం', 'నమస్కార్', 'మెనూ', 'మెను',
  'స్టార్ట్', 'హాయ్ సర్',
])

// Honorifics/fillers that may trail a greeting without adding intent.
const FILLER_WORDS = new Set([
  'sir', 'madam', 'anna', 'garu', 'bro', 'ji', 'please', 'sar',
  'సర్', 'గారు', 'అన్నా', 'బ్రో',
])

/**
 * True when `text` is nothing but a greeting (optionally with an
 * honorific). Anything with real content — a question, a complaint, a
 * product name — returns false so the AI processes it.
 */
export function isBareGreeting(text: string | null | undefined): boolean {
  if (!text) return false
  // Lowercase, drop punctuation/emoji, collapse whitespace. \p{M} keeps
  // Telugu combining marks (viramas/matras) — without it "హాయ్" would be
  // mangled to "హాయ" and never match.
  const norm = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!norm) return false // pure emoji/punctuation — let the AI handle it

  if (GREETING_WORDS.has(norm)) return true

  // "hi sir", "namaste garu" — every token is a greeting or a filler,
  // and it's short (guards against a long message that merely opens with
  // "hi").
  const words = norm.split(' ')
  if (
    words.length <= 3 &&
    words.some((w) => GREETING_WORDS.has(w)) &&
    words.every((w) => GREETING_WORDS.has(w) || FILLER_WORDS.has(w))
  ) {
    return true
  }
  return false
}
