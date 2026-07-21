// ============================================================
// AI service-complaint capture.
//
// When a customer reports a machine problem, the assistant appends a
// directive `[[SERVICE:model|complaint]]` to its reply — same sentinel
// pattern as `[[ORDER:...]]` (parts) and `[[VISIT:...]]`. The auto-reply
// pipeline strips it from the customer-facing text, records a
// `service_requests` row, and alerts the service team, so the complaint
// lands on the Service list without any human step.
// ============================================================

// model is optional (a customer may not know it) → {0,40}; complaint is
// required and free text (single line — template params forbid newlines)
// → up to 200 chars.
const SERVICE_DIRECTIVE = /\[\[SERVICE:([^|\]]{0,40})\|([^\]\n]{1,200})\]\]/gi

/** Max complaints honoured from one reply — bounds hallucinated spam. */
const MAX_SERVICES_PER_REPLY = 3

export interface ParsedService {
  /** Machine model if the customer gave one (e.g. "DC-68G"); may be ''. */
  model: string
  /** The complaint text, required. */
  complaint: string
}

export interface ParsedServices {
  /** Reply text with service directives removed and whitespace tidied. */
  cleanedText: string
  services: ParsedService[]
}

/**
 * Strip `[[SERVICE:...]]` directives from a reply and collect the valid
 * complaints (capped). A hallucinated or malformed directive must never
 * break the reply, so anything without a non-empty complaint is dropped.
 */
export function parseServiceDirectives(text: string): ParsedServices {
  const services: ParsedService[] = []
  for (const match of text.matchAll(SERVICE_DIRECTIVE)) {
    const model = (match[1] ?? '').trim()
    const complaint = (match[2] ?? '').trim()
    if (complaint && services.length < MAX_SERVICES_PER_REPLY) {
      services.push({ model, complaint })
    }
  }
  const cleanedText = text
    .replace(SERVICE_DIRECTIVE, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { cleanedText, services }
}
