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
}

export type LeadGrade = 'hot' | 'warm' | 'cold';

export interface ScoredLead extends LeadInput {
  score: number;
  grade: LeadGrade;
  signals: string[];
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
  return { ...input, score, grade, signals };
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

  const line = (l: ScoredLead) =>
    `• ${l.name || l.phone} (${l.phone}) — score ${l.score}: ${l.signals.join('; ')}`;

  const parts = [
    `📊 Daily lead report — ${windowLabel}`,
    `Total enquiries: ${leads.length} | 🔥 Hot: ${hot.length} | 🌤 Warm: ${warm.length} | ❄ Cold: ${cold.length}`,
  ];
  if (hot.length > 0) parts.push('', '🔥 HOT — call these today:', ...hot.map(line));
  if (warm.length > 0) parts.push('', '🌤 Warm:', ...warm.map(line));
  if (cold.length > 0) parts.push('', `❄ Cold: ${cold.map((l) => l.name || l.phone).join(', ')}`);
  return parts.join('\n');
}
