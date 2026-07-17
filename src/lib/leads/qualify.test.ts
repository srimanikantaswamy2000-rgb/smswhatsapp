import { describe, it, expect } from 'vitest';
import { scoreLead, followUpText, buildReportText, type LeadInput } from './qualify';

function lead(over: Partial<LeadInput> = {}): LeadInput {
  return {
    contactId: 'c1',
    name: 'Ramu',
    phone: '+919000000001',
    conversationId: 'v1',
    inboundTexts: [],
    tags: [],
    ...over,
  };
}

describe('scoreLead', () => {
  it('tags + intent keywords + messages make a hot lead', () => {
    const s = scoreLead(
      lead({ tags: ['demo-request'], inboundTexts: ['MU4501 price entha?', 'ok'] }),
    );
    expect(s.score).toBe(3 + 2 + 2);
    expect(s.grade).toBe('hot');
  });

  it('recognises Telugu intent words', () => {
    const s = scoreLead(lead({ inboundTexts: ['ధర చెప్పండి'] }));
    expect(s.grade).toBe('warm'); // 2 intent + 1 message
    expect(s.signals).toContain('asked about price/EMI/demo');
  });

  it('single chit-chat message stays cold', () => {
    const s = scoreLead(lead({ inboundTexts: ['hello'] }));
    expect(s.score).toBe(1);
    expect(s.grade).toBe('cold');
  });

  it('caps message points at 5', () => {
    const s = scoreLead(lead({ inboundTexts: Array(20).fill('hi') }));
    expect(s.score).toBe(5);
  });
});

describe('followUpText', () => {
  it('follows up in Telugu when the customer wrote Telugu', () => {
    const s = scoreLead(lead({ inboundTexts: ['ధర?'] }));
    expect(followUpText(s)).toContain('నమస్తే Ramu గారు');
  });

  it('falls back to English otherwise', () => {
    const s = scoreLead(lead({ inboundTexts: ['price?'] }));
    expect(followUpText(s)).toContain('Namaste Ramu garu');
  });
});

describe('buildReportText', () => {
  it('groups leads by grade with counts', () => {
    const hot = scoreLead(lead({ tags: ['demo-request'], inboundTexts: ['price', 'a', 'b'] }));
    const cold = scoreLead(lead({ name: 'Sita', phone: '+919000000002', inboundTexts: ['hi'] }));
    const text = buildReportText([hot, cold], '16 Jul 2026');
    expect(text).toContain('🔥 Hot: 1');
    expect(text).toContain('❄ Cold: Sita');
    expect(text).toContain('Ramu (+919000000001)');
  });
});
