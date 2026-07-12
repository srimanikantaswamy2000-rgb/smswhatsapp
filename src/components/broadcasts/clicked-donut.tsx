'use client';

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

interface ClickedDonutProps {
  value: number;
  total: number;
  label: string;
}

/**
 * Recharts donut: filled arc in var(--chart-1) over a var(--chart-3)
 * track, with a centered percentage + label. Used on the broadcast
 * detail page for the read-rate visual (wacrm has no click tracking —
 * see task-10 brief note on "Clicked").
 */
export function ClickedDonut({ value, total, label }: ClickedDonutProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const data = [
    { name: 'value', amount: value },
    { name: 'rest', amount: Math.max(total - value, 0) },
  ];

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative h-48 w-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="name"
              innerRadius="70%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill="var(--chart-1)" />
              <Cell fill="var(--chart-3)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-foreground tabular-nums">{pct}%</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </div>
    </div>
  );
}
