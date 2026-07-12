import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { setAppointmentStatus } from '@/lib/appointments/queries'

// Update / delete a single appointment. RLS (`auth.uid() = user_id`
// on the `appointments` table, see migration 038_appointments.sql)
// scopes both operations to the caller's own rows — no extra
// ownership check needed here.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const { supabase } = await getCurrentAccount()

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    if (typeof body.status === 'string') {
      const allowed = ['booked', 'completed', 'no_show', 'cancelled']
      if (!allowed.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      await setAppointmentStatus(supabase, id, body.status)
      return NextResponse.json({ ok: true })
    }

    const update: Record<string, unknown> = {}
    if (typeof body.phone === 'string') {
      const phone = body.phone.trim()
      if (!phone) return NextResponse.json({ error: 'phone cannot be empty' }, { status: 400 })
      update.phone = phone
    }
    if ('customer_name' in body) update.customer_name = body.customer_name ?? null
    if ('contact_id' in body) update.contact_id = body.contact_id ?? null
    if (typeof body.requested_time === 'string') update.requested_time = body.requested_time

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true })
    }

    const { data, error } = await supabase
      .from('appointments')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ appointment: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const { supabase } = await getCurrentAccount()

    const { error } = await supabase.from('appointments').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
