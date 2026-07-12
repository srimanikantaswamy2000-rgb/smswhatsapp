import { describe, expect, it } from 'vitest';
import { rate, TABS, matchesTab } from './stats';
import type { Broadcast, RecipientStatus } from '@/types';

function makeBroadcast(overrides: Partial<Broadcast> = {}): Broadcast {
  return {
    id: 'b1',
    user_id: 'u1',
    name: 'Test',
    template_name: 'tmpl',
    template_language: 'en_US',
    status: 'sent',
    total_recipients: 100,
    sent_count: 80,
    delivered_count: 70,
    read_count: 40,
    replied_count: 10,
    failed_count: 20,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('rate', () => {
  it('rounds n/d to a whole percentage', () => {
    expect(rate(1, 3)).toBe(33);
    expect(rate(2, 3)).toBe(67);
  });

  it('returns 0 when the denominator is 0', () => {
    expect(rate(5, 0)).toBe(0);
  });

  it('returns 100 when n equals d', () => {
    expect(rate(10, 10)).toBe(100);
  });
});

describe('TABS', () => {
  const b = makeBroadcast();

  it('has the five expected tabs in order', () => {
    expect(TABS.map((t) => t.key)).toEqual([
      'overview',
      'sent',
      'read',
      'replied',
      'failed',
    ]);
  });

  it('overview shows total_recipients at 100%', () => {
    const overview = TABS.find((t) => t.key === 'overview')!;
    expect(overview.value(b)).toBe(100);
    expect(overview.pct(b)).toBe(100);
  });

  it('sent rate is sent_count / total_recipients', () => {
    const sent = TABS.find((t) => t.key === 'sent')!;
    expect(sent.value(b)).toBe(80);
    expect(sent.pct(b)).toBe(80); // 80/100
  });

  it('read rate is read_count / sent_count', () => {
    const read = TABS.find((t) => t.key === 'read')!;
    expect(read.value(b)).toBe(40);
    expect(read.pct(b)).toBe(50); // 40/80
  });

  it('replied rate is replied_count / sent_count', () => {
    const replied = TABS.find((t) => t.key === 'replied')!;
    expect(replied.value(b)).toBe(10);
    expect(replied.pct(b)).toBe(13); // round(10/80*100) = 12.5 -> 13
  });

  it('failed rate is failed_count / total_recipients', () => {
    const failed = TABS.find((t) => t.key === 'failed')!;
    expect(failed.value(b)).toBe(20);
    expect(failed.pct(b)).toBe(20);
  });

  it('handles a zero-recipient broadcast without dividing by zero', () => {
    const empty = makeBroadcast({
      total_recipients: 0,
      sent_count: 0,
      read_count: 0,
      replied_count: 0,
      failed_count: 0,
    });
    for (const tab of TABS) {
      if (tab.key === 'overview') continue;
      expect(tab.pct(empty)).toBe(0);
    }
  });
});

describe('matchesTab', () => {
  const statuses: RecipientStatus[] = [
    'pending',
    'sent',
    'delivered',
    'read',
    'replied',
    'failed',
  ];

  it('overview matches every status', () => {
    for (const s of statuses) {
      expect(matchesTab(s, 'overview')).toBe(true);
    }
  });

  it('sent matches sent/delivered/read/replied but not pending/failed', () => {
    expect(matchesTab('sent', 'sent')).toBe(true);
    expect(matchesTab('delivered', 'sent')).toBe(true);
    expect(matchesTab('read', 'sent')).toBe(true);
    expect(matchesTab('replied', 'sent')).toBe(true);
    expect(matchesTab('pending', 'sent')).toBe(false);
    expect(matchesTab('failed', 'sent')).toBe(false);
  });

  it('read matches read and replied (replied implies having been read)', () => {
    expect(matchesTab('read', 'read')).toBe(true);
    expect(matchesTab('replied', 'read')).toBe(true);
    expect(matchesTab('delivered', 'read')).toBe(false);
    expect(matchesTab('sent', 'read')).toBe(false);
  });

  it('replied matches only replied', () => {
    expect(matchesTab('replied', 'replied')).toBe(true);
    expect(matchesTab('read', 'replied')).toBe(false);
  });

  it('failed matches only failed', () => {
    expect(matchesTab('failed', 'failed')).toBe(true);
    expect(matchesTab('pending', 'failed')).toBe(false);
  });
});
