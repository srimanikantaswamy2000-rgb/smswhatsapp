import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { listAppointments } from '@/lib/appointments/queries'

// Appointments — per-user booking calendar (RLS-scoped by `user_id`,
// see migration 038_appointments.sql). GET lists (optionally
// filtered by `?from=`, `?to=`, `?status=`); POST books a new
// appointment.

export async function GET(request: Request) {
  try {
    const { supabase } = await getCurrentAccount()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from') ?? undefined
    const to = searchParams.get('to') ?? undefined
    const status = (searchParams.get('status') ?? undefined) as
      | 'booked' | 'completed' | 'no_show' | 'cancelled' | undefined
    const appointments = await listAppointments(supabase, { from, to, status })
    return NextResponse.json({ appointments })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await getCurrentAccount()

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    if (!phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 })
    }
    const requested_time = typeof body.requested_time === 'string' ? body.requested_time : ''
    if (!requested_time) {
      return NextResponse.json({ error: 'requested_time is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        user_id: userId,
        contact_id: typeof body.contact_id === 'string' ? body.contact_id : null,
        phone,
        customer_name: typeof body.customer_name === 'string' ? body.customer_name : null,
        requested_time,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ appointment: data }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
