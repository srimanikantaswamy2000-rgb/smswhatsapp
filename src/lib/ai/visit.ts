// ============================================================
// AI showroom-visit booking.
//
// When the customer agrees on a day + time, the assistant appends a
// directive `[[VISIT:YYYY-MM-DD HH:mm]]` (24h clock, IST) to its
// reply — same sentinel pattern as `[[MEDIA:...]]`. The auto-reply
// pipeline strips it from the customer-facing text and books an
// `appointments` row, so the visit shows up on the Appointments page
// without any human step.
// ============================================================

const VISIT_DIRECTIVE = /\[\[VISIT:(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})\]\]/gi;

export interface ParsedVisit {
  /** Reply text with visit directives removed and whitespace tidied. */
  cleanedText: string;
  /** First valid requested time, as an ISO string in IST — or null. */
  requestedTimeIso: string | null;
}

/**
 * Strip `[[VISIT:...]]` from a reply and return the first valid
 * requested time. Times are interpreted as IST (the dealership's and
 * every customer's timezone). Invalid dates are dropped silently —
 * a hallucinated directive must never break the reply.
 */
export function parseVisitDirective(text: string): ParsedVisit {
  let requestedTimeIso: string | null = null;

  for (const match of text.matchAll(VISIT_DIRECTIVE)) {
    const [, date, hh, mm] = match;
    const iso = `${date}T${hh}:${mm}:00+05:30`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime()) && requestedTimeIso === null) {
      requestedTimeIso = iso;
    }
  }

  const cleanedText = text
    .replace(VISIT_DIRECTIVE, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cleanedText, requestedTimeIso };
}
