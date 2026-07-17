// ============================================================
// Lead auto-qualification.
//
// Scores each contact who wrote in during the report window using
// only signals already in the database — no extra AI call:
//
//   +3  tagged demo-request or service-request (menu taps / manual)
//   +2  any inbound message mentions price / EMI / finance / demo
//       (Telugu or English)
//   +1  per inbound message, capped at 5 — talkative = engaged
//
//   hot ≥ 5 · warm ≥ 2 · cold otherwise
//
// Consumed by /api/cron/lead-report, which turns the scores into the
// daily team report + follow-up sends. Pure functions, unit-tested.
// ============================================================

export interface LeadInput {
  contactId: string;
  name: string | null;
  phone: string;
  conversationId: string;
  inboundTexts: string[];
  tags: string[];
  mandal?: string | null;
  district?: string | null;
}

export type LeadGrade = 'hot' | 'warm' | 'cold';

export interface ScoredLead extends LeadInput {
  score: number;
  grade: LeadGrade;
  signals: string[];
  /** Products the customer named in their messages (English labels). */
  products: string[];
  /** "Mandal, District" when the contact row has them. */
  place: string | null;
  /** What they care about — finance, demo, price, exchange, parts, service. */
  preferences: string[];
  /** Their most recent message, for context in the report. */
  lastMessage: string | null;
}

// Model-number vocabulary from the dealership's catalogue. Matched
// against raw customer text (English, Telugu script, or romanised),
// so the patterns are looser than the canonical IDs.
const PRODUCT_PATTERNS: Array<[RegExp, string]> = [
  [/b\s*-?\s*2441/i, 'Kubota B2441 (24 HP compact)'],
  [/b\s*-?\s*2741/i, 'Kubota B2741 (27 HP compact)'],
  [/l\s*-?\s*4508/i, 'Kubota L4508 (45 HP dammu)'],
  [/mu\s*-?\s*4201|4201/i, 'Kubota MU4201 (42 HP)'],
  [/mu\s*-?\s*4501|4501/i, 'Kubota MU4501 (45 HP bestseller)'],
  [/mu\s*-?\s*5502|5502/i, 'Kubota MU5502 (55 HP flagship)'],
  [/dc\s*-?\s*68|68\s*g|king\s*pro/i, 'Kubota DC-68G harvester'],
  [/dc\s*-?\s*99|harvesking/i, 'Kubota DC-99 harvester'],
];
// Generic fallbacks — only reported when no specific model matched.
const GENERIC_HARVESTER = /harvester|కోత|హార్వెస్టర్/i;
const GENERIC_TRACTOR = /tractor|ట్రాక్టర్/i;

const PREFERENCE_PATTERNS: Array<[RegExp, string]> = [
  [/emi|finance|loan|installment|ఫైనాన్స్|ఈఎంఐ|లోన్|రుణం|వాయిదా/i, 'finance/EMI'],
  [/demo|డెమో/i, 'wants demo'],
  [/price|cost|rate|ధర|ఖరీదు|రేటు|ఎంత/i, 'asked price'],
  [/exchange|old tractor|పాత ట్రాక్టర్|ఎక్స్ఛేంజ్/i, 'exchange old vehicle'],
  [/spare|\bparts?\b|విడిభాగ|స్పేర్/i, 'spare parts'],
  [/service|repair|సర్వీస్|రిపేర్|మరమ్మత్తు/i, 'service/repair'],
];

/** Products the texts mention; specific models beat generic terms. */
export function detectProducts(texts: string[]): string[] {
  const joined = texts.join('\n');
  const found = PRODUCT_PATTERNS.filter(([re]) => re.test(joined)).map(([, label]) => label);
  if (found.length === 0) {
    if (GENERIC_HARVESTER.test(joined)) found.push('Combine harvester (model not specified)');
    else if (GENERIC_TRACTOR.test(joined)) found.push('Tractor (model not specified)');
  }
  return found;
}

/** Preference/intent labels the texts reveal. */
export function detectPreferences(texts: string[]): string[] {
  const joined = texts.join('\n');
  return PREFERENCE_PATTERNS.filter(([re]) => re.test(joined)).map(([, label]) => label);
}

const INTENT_TAGS = new Set(['demo-request', 'service-request']);

// Buying-intent vocabulary, Telugu + English + common romanised forms.
const INTENT_PATTERN =
  /price|cost|rate|emi|finance|loan|demo|book|visit|ధర|ఖరీదు|ఫైనాన్స్|డెమో|ఈఎంఐ|రేటు|కొన|బుక్/i;

export function scoreLead(input: LeadInput): ScoredLead {
  let score = 0;
  const signals: string[] = [];

  const intentTags = input.tags.filter((t) => INTENT_TAGS.has(t));
  if (intentTags.length > 0) {
    score += 3;
    signals.push(intentTags.join(', '));
  }

  if (input.inboundTexts.some((t) => INTENT_PATTERN.test(t))) {
    score += 2;
    signals.push('asked about price/EMI/demo');
  }

  const msgPoints = Math.min(input.inboundTexts.length, 5);
  score += msgPoints;
  signals.push(`${input.inboundTexts.length} message${input.inboundTexts.length === 1 ? '' : 's'}`);

  const grade: LeadGrade = score >= 5 ? 'hot' : score >= 2 ? 'warm' : 'cold';

  const placeParts = [input.mandal, input.district].filter(
    (p): p is string => !!p && p.trim() !== '',
  );
  return {
    ...input,
    score,
    grade,
    signals,
    products: detectProducts(input.inboundTexts),
    place: placeParts.length > 0 ? placeParts.join(', ') : null,
    preferences: detectPreferences(input.inboundTexts),
    lastMessage: input.inboundTexts.at(-1) ?? null,
  };
}

/** Telugu-script sniff — follow-ups go out in the customer's language. */
const TELUGU_RANGE = /[ఀ-౿]/;

export function followUpText(lead: ScoredLead): string {
  const telugu = lead.inboundTexts.some((t) => TELUGU_RANGE.test(t));
  const name = lead.name?.trim();
  if (telugu) {
    return (
      `🙏 నమస్తే${name ? ` ${name} గారు` : ''}! శ్రీ మాణిక్యంత స్వామి అగ్రి ఫార్మ్ నుంచి.\n\n` +
      'మీరు అడిగిన వివరాల గురించి — ఇంకా ఏమైనా సందేహాలు ఉన్నాయా? ధర, ఫైనాన్స్ (100కి 55 పైసల నుంచి), ఉచిత డెమో — ఏది కావాలన్నా రిప్లై చేయండి.\n\n' +
      '📞 +91 85006 66928 / +91 94938 47755'
    );
  }
  return (
    `🙏 Namaste${name ? ` ${name} garu` : ''}! From Sri Manikanta Swamy Agri Farm.\n\n` +
    'Following up on your enquiry — any more questions? Price, finance (from 55 paise per ₹100), or a free field demo — just reply here.\n\n' +
    '📞 +91 85006 66928 / +91 94938 47755'
  );
}

/** Plain-text daily report for WhatsApp / the notifications panel. */
export function buildReportText(leads: ScoredLead[], windowLabel: string): string {
  const hot = leads.filter((l) => l.grade === 'hot');
  const warm = leads.filter((l) => l.grade === 'warm');
  const cold = leads.filter((l) => l.grade === 'cold');

  const line = (l: ScoredLead) => {
    const extras = [l.products[0], l.place, ...l.preferences].filter(Boolean).join(' · ');
    return `• ${l.name || l.phone} (${l.phone})${extras ? ` — ${extras}` : ''} — score ${l.score}: ${l.signals.join('; ')}`;
  };

  const parts = [
    `📊 Daily lead report — ${windowLabel}`,
    `Total enquiries: ${leads.length} | 🔥 Hot: ${hot.length} | 🌤 Warm: ${warm.length} | ❄ Cold: ${cold.length}`,
  ];
  if (hot.length > 0) parts.push('', '🔥 HOT — call these today:', ...hot.map(line));
  if (warm.length > 0) parts.push('', '🌤 Warm:', ...warm.map(line));
  if (cold.length > 0) parts.push('', `❄ Cold: ${cold.map((l) => l.name || l.phone).join(', ')}`);
  return parts.join('\n');
}
