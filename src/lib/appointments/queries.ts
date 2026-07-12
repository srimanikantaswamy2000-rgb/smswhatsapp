import type { SupabaseClient } from '@supabase/supabase-js'

export interface Appointment {
  id: string
  user_id: string
  contact_id: string | null
  phone: string
  customer_name: string | null
  requested_time: string
  status: 'booked' | 'completed' | 'no_show' | 'cancelled'
  created_at: string
}

type DB = SupabaseClient

export interface ListAppointmentsFilters {
  from?: string
  to?: string
  status?: Appointment['status']
}

export async function listAppointments(
  db: DB,
  { from, to, status }: ListAppointmentsFilters,
): Promise<Appointment[]> {
  let query = db.from('appointments').select('*')

  if (from) query = query.gte('requested_time', from)
  if (to) query = query.lte('requested_time', to)
  if (status) query = query.eq('status', status)

  const { data, error } = await query.order('requested_time', { ascending: true })
  if (error) throw error
  return (data ?? []) as Appointment[]
}

export async function setAppointmentStatus(
  db: DB,
  id: string,
  status: Appointment['status'],
): Promise<void> {
  const { error } = await db.from('appointments').update({ status }).eq('id', id)
  if (error) throw error
}
