import type { SupabaseClient } from '@supabase/supabase-js'

// Service complaints captured by the bot (migration 047). RLS-scoped by
// `user_id`, same as appointments / part_orders.

export type ServiceRequestStatus =
  | 'pending'
  | 'contacted'
  | 'resolved'
  | 'cancelled'

export interface ServiceRequest {
  id: string
  request_no: number
  user_id: string
  contact_id: string | null
  conversation_id: string | null
  machine_model: string | null
  complaint: string
  customer_name: string | null
  customer_phone: string | null
  status: ServiceRequestStatus
  team_notified_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

type DB = SupabaseClient

export async function listServiceRequests(
  db: DB,
  filters: { status?: ServiceRequestStatus } = {},
): Promise<ServiceRequest[]> {
  let query = db.from('service_requests').select('*')
  if (filters.status) query = query.eq('status', filters.status)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ServiceRequest[]
}

export async function setServiceRequestStatus(
  db: DB,
  id: string,
  status: ServiceRequestStatus,
): Promise<void> {
  // Stamp resolved_at when moving to resolved; clear it otherwise so a
  // re-opened request doesn't keep a stale resolution time.
  const patch: Record<string, unknown> = {
    status,
    resolved_at: status === 'resolved' ? new Date().toISOString() : null,
  }
  const { error } = await db.from('service_requests').update(patch).eq('id', id)
  if (error) throw error
}
