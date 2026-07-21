'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, Wrench, ChevronDown, MessageSquare } from 'lucide-react';
import type {
  ServiceRequest,
  ServiceRequestStatus,
} from '@/lib/service-requests/queries';

const STATUS_OPTIONS: ServiceRequestStatus[] = [
  'pending',
  'contacted',
  'resolved',
  'cancelled',
];

const STATUS_BADGE: Record<
  ServiceRequestStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'default',
  contacted: 'outline',
  resolved: 'secondary',
  cancelled: 'destructive',
};

export default function ServicePage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchSeq = useRef(0);

  const fetchRequests = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const res = await fetch('/api/service-requests');
      if (seq !== fetchSeq.current) return;
      if (!res.ok) {
        toast.error('Failed to load service requests');
        return;
      }
      const { serviceRequests } = await res.json();
      setRequests(serviceRequests ?? []);
    } catch {
      if (seq === fetchSeq.current) toast.error('Failed to load service requests');
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRequests();
  }, [fetchRequests]);

  async function handleStatusChange(id: string, status: ServiceRequestStatus) {
    try {
      const res = await fetch(`/api/service-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error('Failed to update status');
        return;
      }
      toast.success('Status updated');
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r)),
      );
    } catch {
      toast.error('Failed to update status');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Service list</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {requests.length > 0
            ? `${requests.length} service ${requests.length === 1 ? 'request' : 'requests'} from the bot`
            : 'Complaints raised through the bot appear here'}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <Wrench className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No service requests yet</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
          {requests.map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    #{r.request_no}
                  </span>
                  <p className="text-sm font-medium text-foreground truncate">
                    {r.customer_name || r.customer_phone || 'Customer'}
                  </p>
                  {r.machine_model && (
                    <Badge variant="outline" className="text-xs">
                      {r.machine_model}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-foreground mt-1 break-words">
                  {r.complaint}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{r.customer_phone}</span>
                  <span>·</span>
                  <span>{format(new Date(r.created_at), 'MMM d, p')}</span>
                  {r.conversation_id && (
                    <Link
                      href={`/inbox?conversation=${r.conversation_id}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <MessageSquare className="size-3" />
                      Chat &amp; photos
                    </Link>
                  )}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center gap-1 outline-none">
                  <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="border-border bg-popover text-popover-foreground"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => handleStatusChange(r.id, status)}
                      className={
                        status === r.status ? 'text-primary' : 'text-popover-foreground'
                      }
                    >
                      {status}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
