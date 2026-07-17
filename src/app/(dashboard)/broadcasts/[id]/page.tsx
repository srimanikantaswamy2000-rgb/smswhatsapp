'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Broadcast, BroadcastRecipient } from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Loader2, Download, Trash2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { getBroadcastStatus, getRecipientStatus } from '@/lib/broadcast-status';
import { StatTabs } from '@/components/broadcasts/stat-tabs';
import { ClickedDonut } from '@/components/broadcasts/clicked-donut';
import { TABS, matchesTab, type StatTabKey } from '@/lib/broadcasts/stats';
import { useTranslations } from 'next-intl';

/**
 * RFC 4180 CSV quoting — quote every field so commas/newlines/quotes
 * round-trip cleanly.
 */
function toCsv(rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(escape).join(',')).join('\n');
}

function downloadBlob(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Denominator each StatTabs rate is computed against — mirrors the
 * pct() definitions in src/lib/broadcasts/stats.ts, used here to feed
 * the donut with the same value/total pair as the active tab.
 */
function tabDenominator(broadcast: Broadcast, key: StatTabKey): number {
  switch (key) {
    case 'overview':
    case 'sent':
    case 'failed':
      return broadcast.total_recipients;
    case 'read':
    case 'replied':
      return broadcast.sent_count;
  }
}

export default function BroadcastDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('Broadcasts.detail');
  const tStatus = useTranslations('Broadcasts.status');
  const tWizard = useTranslations('Broadcasts.wizard.selectAudience');
  const broadcastId = params.id as string;

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StatTabKey>('overview');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient();

        const { data: bc, error: bcError } = await supabase
          .from('broadcasts')
          .select('*')
          .eq('id', broadcastId)
          .single();

        if (bcError) throw bcError;
        setBroadcast(bc);

        const { data: recs, error: recsError } = await supabase
          .from('broadcast_recipients')
          .select('*, contact:contacts(*)')
          .eq('broadcast_id', broadcastId)
          .order('created_at', { ascending: false });

        if (recsError) throw recsError;
        setRecipients(recs ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('notFound'));
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [broadcastId]);

  const filteredRecipients = useMemo(
    () => recipients.filter((r) => matchesTab(r.status, activeTab)),
    [recipients, activeTab],
  );

  function selectTab(key: StatTabKey) {
    setActiveTab(key);
    setSelectedIds(new Set());
  }

  const allVisibleSelected =
    filteredRecipients.length > 0 &&
    filteredRecipients.every((r) => selectedIds.has(r.id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecipients.map((r) => r.id)));
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleReBroadcast() {
    const contactIds = [
      ...new Set(
        recipients
          .filter((r) => selectedIds.has(r.id) && r.contact_id)
          .map((r) => r.contact_id as string),
      ),
    ];
    if (contactIds.length === 0) return;
    router.push(`/broadcasts/new?contacts=${contactIds.join(',')}`);
  }

  function handleExport() {
    if (!broadcast) return;
    const header = [
      t('table.contact'),
      t('table.phone'),
      t('table.status'),
      t('table.sent'),
      t('table.delivered'),
      t('table.read'),
      t('table.error'),
    ];
    const rows = recipients.map((r) => [
      r.contact?.name ?? '',
      r.contact?.phone ?? '',
      r.status,
      r.sent_at ?? '',
      r.delivered_at ?? '',
      r.read_at ?? '',
      r.error_message ?? '',
    ]);
    const csv = toCsv([header, ...rows]);
    const safeName = broadcast.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    downloadBlob(`broadcast-${safeName}-${broadcastId.slice(0, 8)}.csv`, csv);
  }

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();
    // broadcast_recipients cascades on broadcasts.id (migration 001), so a
    // single delete is sufficient — the aggregate trigger in migration 003
    // is defined on broadcast_recipients but fires only on its own row
    // changes, not on a cascaded drop of the parent row.
    const { error: delErr } = await supabase
      .from('broadcasts')
      .delete()
      .eq('id', broadcastId);
    setDeleting(false);
    if (delErr) {
      toast.error(t('toastFailedDelete', { error: delErr.message }));
      return;
    }
    toast.success(t('toastDeleted'));
    router.push('/broadcasts');
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !broadcast) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error ?? t('notFound')}</p>
        <Button variant="outline" onClick={() => router.push('/broadcasts')}>
          {t('backToBroadcasts')}
        </Button>
      </div>
    );
  }

  const status = getBroadcastStatus(broadcast.status);
  const activeTabDef = TABS.find((tab) => tab.key === activeTab)!;
  const donutValue = activeTabDef.value(broadcast);
  const donutTotal = tabDenominator(broadcast, activeTab);
  const audienceType = (broadcast.audience_filter?.type as string) ?? 'all';
  const audienceLabel =
    audienceType === 'tags'
      ? tWizard('method.tags')
      : audienceType === 'custom_field'
        ? tWizard('method.customField')
        : audienceType === 'csv'
          ? tWizard('method.csv')
          : audienceType === 'contacts'
            ? tWizard('method.contacts')
            : tWizard('method.all');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/broadcasts')}
            className="border-border"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{broadcast.name}</h1>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
              >
                {tStatus(status.label)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
              <span>{t('template', { name: broadcast.template_name })}</span>
              <span>-</span>
              <span>
                {t('createdAt', { date: new Date(broadcast.created_at).toLocaleDateString() })}
              </span>
            </div>
          </div>
        </div>

        {confirmDelete ? (
          <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm">
            <span className="text-red-300">{t('deletePrompt')}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="h-7 border-border bg-transparent text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="h-7 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? t('deleting') : t('confirm')}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={broadcast.status === 'sending'}
            onClick={() => setConfirmDelete(true)}
            title={
              broadcast.status === 'sending'
                ? t('cannotDeleteSending')
                : t('deleteHover')
            }
            className="border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('delete')}
          </Button>
        )}
      </div>

      {/* Stat tab row */}
      <StatTabs broadcast={broadcast} active={activeTab} onSelect={selectTab} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* Left column: template preview + rate donut */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t('template', { name: broadcast.template_name })}
            </h3>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">{broadcast.template_language}</p>
              {broadcast.template_variables &&
              Object.keys(broadcast.template_variables).length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-foreground">
                  {Object.entries(broadcast.template_variables).map(([key, value]) => (
                    <li key={key} className="flex gap-1">
                      <span className="text-muted-foreground">{`{{${key}}}`}</span>
                      <span className="truncate">
                        {/* Mappings are stored as {type, value} objects;
                            String() on those printed "[object Object]". */}
                        {typeof value === 'object' && value !== null && 'value' in value
                          ? `${(value as { type?: string }).type ?? 'static'}: ${String((value as { value?: string }).value ?? '')}`
                          : String(value)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <ClickedDonut
              value={donutValue}
              total={donutTotal}
              label={t(`tabs.${activeTabDef.key}`)}
            />
          </div>
        </div>

        {/* Right column: Smart Segregation */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-medium text-foreground">{t('smartSegregation')}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('audienceLine', {
                  label: audienceLabel,
                  count: broadcast.total_recipients,
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={recipients.length === 0}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" />
                {t('exportCsv')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                disabled={selectedIds.size === 0}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleReBroadcast}
                disabled={selectedIds.size === 0}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {t('reBroadcast')}
              </Button>
            </div>
          </div>

          {filteredRecipients.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {recipients.length === 0 ? t('noRecipients') : t('noRecipientsFilter')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label={t('smartSegregation')}
                      />
                    </TableHead>
                    <TableHead className="text-muted-foreground">{t('table.contact')}</TableHead>
                    <TableHead className="text-muted-foreground">{t('table.phone')}</TableHead>
                    <TableHead className="text-muted-foreground">{t('table.status')}</TableHead>
                    <TableHead className="text-muted-foreground">{t('table.sent')}</TableHead>
                    <TableHead className="text-muted-foreground">{t('table.delivered')}</TableHead>
                    <TableHead className="text-muted-foreground">{t('table.read')}</TableHead>
                    <TableHead className="text-muted-foreground">{t('table.error')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecipients.map((recipient) => {
                    const rStatus = getRecipientStatus(recipient.status);
                    return (
                      <TableRow key={recipient.id} className="border-border">
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(recipient.id)}
                            onCheckedChange={() => toggleRow(recipient.id)}
                            disabled={!recipient.contact_id}
                            aria-label={recipient.contact?.name ?? recipient.id}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {recipient.contact?.name ?? 'Unknown'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {recipient.contact?.phone ?? '-'}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${rStatus.classes}`}
                          >
                            {tStatus(rStatus.label)}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {recipient.sent_at ? new Date(recipient.sent_at).toLocaleString() : '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {recipient.delivered_at
                            ? new Date(recipient.delivered_at).toLocaleString()
                            : '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {recipient.read_at ? new Date(recipient.read_at).toLocaleString() : '-'}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-red-400">
                          {recipient.error_message ?? '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
