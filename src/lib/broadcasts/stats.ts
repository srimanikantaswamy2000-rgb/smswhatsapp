/**
 * Pure stat-tab math for the broadcast detail page. Kept dependency-free
 * (no Supabase, no React) so it's cheaply unit-testable and reusable by
 * both <StatTabs> and the recipients-table filter.
 *
 * Rate definitions mirror the aggregate-count semantics baked into the
 * `recompute_broadcast_counts` trigger (supabase/migrations/005_broadcast_counts_incremental.sql):
 *   sent_count    = recipients with status IN (sent, delivered, read, replied)
 *   read_count    = recipients with status IN (read, replied)  -- replied implies read
 *   replied_count = recipients with status = replied
 *   failed_count  = recipients with status = failed
 * so `matchesTab` below filters recipient rows using the same status sets
 * the DB used to derive the broadcast-level counts consumed by TABS.
 */

import type { Broadcast, RecipientStatus } from '@/types';

export type StatTabKey = 'overview' | 'sent' | 'read' | 'replied' | 'failed';

/** d > 0 ? round((n / d) * 100) : 0 */
export function rate(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export interface StatTabDef {
  key: StatTabKey;
  label: string;
  value: (b: Broadcast) => number;
  pct: (b: Broadcast) => number;
}

export const TABS: readonly StatTabDef[] = [
  {
    key: 'overview',
    label: 'Overview',
    value: (b) => b.total_recipients,
    pct: () => 100,
  },
  {
    key: 'sent',
    label: 'Sent',
    value: (b) => b.sent_count,
    pct: (b) => rate(b.sent_count, b.total_recipients),
  },
  {
    key: 'read',
    label: 'Read',
    value: (b) => b.read_count,
    pct: (b) => rate(b.read_count, b.sent_count),
  },
  {
    key: 'replied',
    label: 'Replied',
    value: (b) => b.replied_count,
    pct: (b) => rate(b.replied_count, b.sent_count),
  },
  {
    key: 'failed',
    label: 'Failed',
    value: (b) => b.failed_count,
    pct: (b) => rate(b.failed_count, b.total_recipients),
  },
] as const;

const SENT_STATUSES: readonly RecipientStatus[] = [
  'sent',
  'delivered',
  'read',
  'replied',
];
const READ_STATUSES: readonly RecipientStatus[] = ['read', 'replied'];

/** Maps a StatTabKey to the recipient-status set that backs its count. */
export function matchesTab(status: RecipientStatus, tab: StatTabKey): boolean {
  switch (tab) {
    case 'overview':
      return true;
    case 'sent':
      return SENT_STATUSES.includes(status);
    case 'read':
      return READ_STATUSES.includes(status);
    case 'replied':
      return status === 'replied';
    case 'failed':
      return status === 'failed';
  }
}
