// ============================================================
// AI spare-parts ordering.
//
// Customers ask for spare parts in chat (by name, in English or
// Telugu, or with a photo). Before generating a reply we search the
// `parts` catalogue (imported from the KubotaPad PDF by
// scripts/import-parts-catalogue.ts) for anything the latest
// messages mention and inject the matches into the system prompt.
// When the customer confirms, the assistant emits
// `[[ORDER:<part_number>|<part_name>|<qty>]]` — same sentinel
// pattern as `[[MEDIA:...]]` / `[[VISIT:...]]` — which the
// auto-reply pipeline turns into a `part_orders` row and a ping to
// the spare-parts team.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

const ORDER_DIRECTIVE =
  /\[\[ORDER:([A-Z0-9-]{6,20})\|([^|\]]{1,80})\|(\d{1,3})\]\]/gi

/** Max orders honoured from a single reply — bounds hallucinated spam. */
export const MAX_ORDERS_PER_REPLY = 3

/** Max catalogue matches injected into the prompt. */
const MAX_PART_MATCHES = 12

export interface PartMatch {
  part_number: string
  part_name: string | null
  category: string | null
  price: number | null
  stock_qty: number
}

export interface ParsedOrder {
  partNumber: string
  partName: string
  qty: number
}

export interface ParsedOrders {
  /** Reply text with order directives removed and whitespace tidied. */
  cleanedText: string
  orders: ParsedOrder[]
}

// Common Telugu / Roman-Telugu spare-part words mapped to the English
// terms the catalogue uses. The catalogue is English-only, so a Telugu
// question would otherwise never match.
const PARTS_GLOSSARY: Record<string, string> = {
  'క్లచ్': 'clutch',
  'బ్రేక్': 'brake',
  'ఫిల్టర్': 'filter',
  'ఆయిల్': 'oil',
  'ఎయిర్': 'air',
  'డీజిల్': 'fuel',
  'పిస్టన్': 'piston',
  'బేరింగ్': 'bearing',
  'బెల్ట్': 'belt',
  'గేర్': 'gear',
  'టైర్': 'tire',
  'బ్యాటరీ': 'battery',
  'రేడియేటర్': 'radiator',
  'పంపు': 'pump',
  'పంప్': 'pump',
  'నాజిల్': 'nozzle',
  'గాస్కెట్': 'gasket',
  'హెడ్‌లైట్': 'lamp',
  'లైట్': 'lamp',
  'సైలెన్సర్': 'muffler',
  'స్టీరింగ్': 'steering',
  'యాక్సిల్': 'axle',
  'ఇంజిన్': 'engine',
}

// Words that appear constantly in chat but never narrow a parts search.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'need', 'want', 'have', 'please', 'part',
  'parts', 'spare', 'spares', 'tractor', 'kubota', 'price', 'cost', 'one',
  'two', 'order', 'available', 'availability', 'send', 'give', 'get',
  'namaste', 'sir', 'garu', 'hello', 'this', 'that', 'much', 'many',
  'when', 'what', 'where', 'about', 'from', 'there', 'here',
])

/**
 * Extract catalogue search tokens from recent customer text: English
 * words (3+ chars, minus stopwords) plus glossary translations of any
 * Telugu part words found.
 */
export function extractPartTokens(text: string): string[] {
  const tokens = new Set<string>()
  for (const m of text.matchAll(/[A-Za-z][A-Za-z-]{2,}/g)) {
    const w = m[0].toLowerCase()
    if (!STOPWORDS.has(w)) tokens.add(w)
  }
  // Exact part numbers (e.g. "TC740-16300") are the strongest signal.
  for (const m of text.matchAll(/[A-Z0-9]{2,7}-[A-Z0-9]{3,7}/g)) {
    tokens.add(m[0].toUpperCase())
  }
  for (const [te, en] of Object.entries(PARTS_GLOSSARY)) {
    if (text.includes(te)) tokens.add(en)
  }
  return [...tokens].slice(0, 8)
}

/**
 * Search the owner's parts catalogue for the given tokens. Rows
 * matching more tokens rank first. Empty tokens → empty result (no
 * table scan on chit-chat).
 */
export async function searchParts(
  db: SupabaseClient,
  userId: string,
  tokens: string[],
): Promise<PartMatch[]> {
  if (tokens.length === 0) return []

  // Weighted ranking: an exact part-number hit trumps a name hit,
  // which trumps a category-only hit (a token like "clutch" matches
  // every bolt in the CLUTCH chapter via category — those must not
  // bury the actual clutch parts). Generic fasteners are demoted
  // unless the customer literally asked for one.
  const scores = new Map<string, { row: PartMatch; hits: number }>()
  const SELECT = 'part_number, part_name, category, price, stock_qty'

  // Two queries per token, NOT one .or() — a single query's row limit
  // lets hundreds of category-only rows (every bolt in the CLUTCH
  // chapter) crowd the actual name matches out of the result window.
  // All queries run concurrently: this sits on the customer's reply
  // latency, so serial round-trips are not acceptable.
  const perToken = await Promise.all(
    tokens.map(async (token) => {
      const clean = token.replace(/[%_]/g, '')
      const pattern = `%${clean}%`
      const [named, byCategory] = await Promise.all([
        db
          .from('parts')
          .select(SELECT)
          .eq('user_id', userId)
          .or(`part_name.ilike.${pattern},part_number.ilike.${pattern}`)
          .limit(30),
        db
          .from('parts')
          .select(SELECT)
          .eq('user_id', userId)
          .ilike('category', pattern)
          .limit(20),
      ])
      return { token: clean.toLowerCase(), named, byCategory }
    }),
  )

  for (const { token: t, named, byCategory } of perToken) {
    for (const row of (named.data ?? []) as PartMatch[]) {
      const numberHit = row.part_number.toLowerCase().includes(t)
      const entry = scores.get(row.part_number) ?? { row, hits: 0 }
      entry.hits += numberHit ? 6 : 3
      scores.set(row.part_number, entry)
    }
    for (const row of (byCategory.data ?? []) as PartMatch[]) {
      const entry = scores.get(row.part_number) ?? { row, hits: 0 }
      entry.hits += 1
      scores.set(row.part_number, entry)
    }
  }

  const GENERIC_HARDWARE = /^(BOLT|NUT|WASHER|SCREW|PIN|CLIP|BAND|O RING|O-RING|SEAL|GASKET|PLUG)\b/i
  const askedForHardware = tokens.some((t) =>
    GENERIC_HARDWARE.test(t.replace(/s$/i, '')),
  )
  for (const entry of scores.values()) {
    if (!askedForHardware && GENERIC_HARDWARE.test(entry.row.part_name ?? '')) {
      entry.hits -= 2
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.hits - a.hits || a.row.part_number.localeCompare(b.row.part_number))
    .slice(0, MAX_PART_MATCHES)
    .map((e) => e.row)
}

/**
 * Render catalogue matches as a system-prompt block teaching the model
 * how (and when) to place an order.
 */
export function buildPartsBlock(matches: PartMatch[]): string {
  const lines = matches.map((p) => {
    const bits = [`${p.part_number} — ${p.part_name ?? '(unnamed)'}`]
    if (p.category) bits.push(p.category)
    if (p.price != null && p.price > 0) bits.push(`₹${p.price}`)
    return `- ${bits.join(' · ')}`
  })
  return (
    'Spare-parts catalogue — genuine Kubota parts matching what the customer mentioned ' +
    '(part number — name · assembly). Use ONLY these part numbers; never invent one. ' +
    'Do not promise availability or delivery time — the spare-parts team confirms that after the order is placed. ' +
    'When the customer clearly confirms they want a part, append the directive ' +
    '[[ORDER:<part_number>|<part_name>|<qty>]] to your reply (it is stripped before sending) ' +
    'and tell them the spare-parts team will confirm availability shortly. ' +
    'If none of these match what they need, ask for the part number from the part label or a clear photo.\n' +
    lines.join('\n')
  )
}

/**
 * Strip `[[ORDER:...]]` directives from a reply and collect the valid
 * orders (de-duplicated by part number, capped).
 */
export function parseOrderDirectives(text: string): ParsedOrders {
  const orders: ParsedOrder[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(ORDER_DIRECTIVE)) {
    const partNumber = match[1].toUpperCase()
    const qty = Math.max(1, parseInt(match[3], 10) || 1)
    if (!seen.has(partNumber) && orders.length < MAX_ORDERS_PER_REPLY) {
      seen.add(partNumber)
      orders.push({ partNumber, partName: match[2].trim(), qty })
    }
  }
  const cleanedText = text
    .replace(ORDER_DIRECTIVE, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { cleanedText, orders }
}

/**
 * Parse a spare-parts-team WhatsApp reply like "OK 12" / "ok #12" /
 * "NO 12" into an order resolution. Returns null when the text isn't
 * an order verdict (the team chats normally on the same number).
 */
export function parseTeamVerdict(
  text: string,
): { orderNo: number; accepted: boolean } | null {
  const m = text.trim().match(/^(ok|yes|no|not?avail(?:able)?)\s*#?(\d{1,8})$/i)
  if (!m) return null
  const verb = m[1].toLowerCase()
  return { orderNo: parseInt(m[2], 10), accepted: verb === 'ok' || verb === 'yes' }
}
