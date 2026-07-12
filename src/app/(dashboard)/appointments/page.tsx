'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { format, isToday, isTomorrow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Loader2, CalendarDays, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Appointment } from '@/lib/appointments/queries';

const STATUS_OPTIONS: Appointment['status'][] = [
  'booked',
  'completed',
  'no_show',
  'cancelled',
];

const STATUS_BADGE_VARIANT: Record<Appointment['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  booked: 'default',
  completed: 'secondary',
  no_show: 'outline',
  cancelled: 'destructive',
};

function dayHeaderLabel(date: Date, t: ReturnType<typeof useTranslations>): string {
  if (isToday(date)) return t('today');
  if (isTomorrow(date)) return t('tomorrow');
  return format(date, 'EEEE, MMM d');
}

export default function AppointmentsPage() {
  const t = useTranslations('Appointments.page');

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [requestedTime, setRequestedTime] = useState('');

  // Guards against out-of-order fetch responses (mirrors the
  // inventory page pattern).
  const fetchSeq = useRef(0);

  const fetchAppointments = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    const res = await fetch('/api/appointments');
    if (seq !== fetchSeq.current) return; // superseded by a newer fetch
    if (!res.ok) {
      toast.error(t('toastFailedLoad'));
      setLoading(false);
      return;
    }
    const { appointments: rows } = await res.json();
    setAppointments(rows ?? []);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAppointments();
  }, [fetchAppointments]);

  function openAddForm() {
    setPhone('');
    setCustomerName('');
    setRequestedTime('');
    setFormOpen(true);
  }

  async function handleSave() {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      toast.error(t('phoneRequired'));
      return;
    }
    if (!requestedTime) {
      toast.error(t('requestedTimeRequired'));
      return;
    }
    setSaving(true);

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: trimmedPhone,
        customer_name: customerName.trim() || null,
        requested_time: new Date(requestedTime).toISOString(),
      }),
    });

    if (!res.ok) {
      toast.error(t('toastFailedSave'));
    } else {
      toast.success(t('toastSaved'));
      setFormOpen(false);
      fetchAppointments();
    }
    setSaving(false);
  }

  async function handleStatusChange(id: string, status: Appointment['status']) {
    const res = await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error(t('toastFailedStatus'));
      return;
    }
    toast.success(t('toastStatusUpdated'));
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a)),
    );
  }

  // Group appointments by calendar day, in the order they were
  // returned (already sorted by requested_time from the API).
  const groups: { key: string; date: Date; items: Appointment[] }[] = [];
  for (const appt of appointments) {
    const date = new Date(appt.requested_time);
    const key = format(date, 'yyyy-MM-dd');
    const group = groups.find((g) => g.key === key);
    if (group) {
      group.items.push(appt);
    } else {
      groups.push({ key, date, items: [appt] });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {appointments.length > 0
              ? t('subtitle', { count: appointments.length })
              : t('subtitleZero')}
          </p>
        </div>
        <Button
          onClick={openAddForm}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Plus className="size-4" />
          {t('newAppointmentBtn')}
        </Button>
      </div>

      {/* List, grouped by day */}
      {loading ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        </div>
      ) : appointments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <CalendarDays className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('noAppointmentsYet')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {dayHeaderLabel(group.date, t)}
              </h2>
              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {group.items.map((appt) => (
                  <div
                    key={appt.id}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {appt.customer_name || (
                          <span className="text-muted-foreground italic">{t('unnamed')}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {appt.phone} · {format(new Date(appt.requested_time), 'p')}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center gap-1 outline-none">
                        <Badge variant={STATUS_BADGE_VARIANT[appt.status]}>
                          {t(`status.${appt.status}`)}
                        </Badge>
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="border-border bg-popover text-popover-foreground"
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <DropdownMenuItem
                            key={status}
                            onClick={() => handleStatusChange(appt.id, status)}
                            className={
                              status === appt.status ? 'text-primary' : 'text-popover-foreground'
                            }
                          >
                            {t(`status.${status}`)}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Appointment Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t('newAppointmentTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('newAppointmentDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="appt-phone">{t('form.phone')}</Label>
              <Input
                id="appt-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-card border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appt-customer-name">{t('form.customerName')}</Label>
              <Input
                id="appt-customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="bg-card border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appt-requested-time">{t('form.requestedTime')}</Label>
              <Input
                id="appt-requested-time"
                type="datetime-local"
                value={requestedTime}
                onChange={(e) => setRequestedTime(e.target.value)}
                className="bg-card border-border text-foreground"
              />
            </div>
          </div>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
