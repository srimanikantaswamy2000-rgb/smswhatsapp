'use client';

import { Users, Send, Eye, MessageCircle, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Broadcast } from '@/types';
import { TABS, type StatTabKey } from '@/lib/broadcasts/stats';

const TAB_ICONS: Record<StatTabKey, typeof Users> = {
  overview: Users,
  sent: Send,
  read: Eye,
  replied: MessageCircle,
  failed: AlertCircle,
};

interface StatTabsProps {
  broadcast: Broadcast;
  active: StatTabKey;
  onSelect: (key: StatTabKey) => void;
}

/**
 * Horizontal row of stat tabs — big percentage, muted count, icon +
 * label underneath, purple underline on the active tab. Rate math and
 * the tab list itself live in src/lib/broadcasts/stats.ts so they stay
 * unit-testable without rendering React.
 */
export function StatTabs({ broadcast, active, onSelect }: StatTabsProps) {
  const t = useTranslations('Broadcasts.detail.tabs');

  return (
    <div className="flex divide-x divide-border rounded-xl border border-border bg-card">
      {TABS.map((tab) => {
        const Icon = TAB_ICONS[tab.key];
        const isActive = tab.key === active;
        const value = tab.value(broadcast);
        const pct = tab.pct(broadcast);
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            aria-current={isActive ? 'true' : undefined}
            className={`relative flex flex-1 flex-col items-center gap-1 px-3 py-4 text-center transition-colors ${
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="text-2xl font-bold tabular-nums">
              {pct}%
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                ({value.toLocaleString()})
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Icon className="h-3.5 w-3.5" />
              {t(tab.key)}
            </span>
            {isActive && (
              <span
                className="absolute inset-x-0 bottom-0 h-0.5"
                style={{ backgroundColor: 'var(--chart-1)' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
