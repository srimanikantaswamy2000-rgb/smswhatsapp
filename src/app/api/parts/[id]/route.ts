import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// Update / delete a single part. RLS (`auth.uid() = user_id` on the
// `parts` table, see migration 037_parts.sql) scopes both operations
// to the caller's own rows — no extra ownership check needed here.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const { supabase } = await getCurrentAccount()

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const update: Record<string, unknown> = {}
    if (typeof body.part_number === 'string') {
      const part_number = body.part_number.trim()
      if (!part_number) return NextResponse.json({ error: 'part_number cannot be empty' }, { status: 400 })
      update.part_number = part_number
    }
    if ('part_name' in body) update.part_name = body.part_name ?? null
    if ('category' in body) update.category = body.category ?? null
    if ('price' in body) update.price = body.price ?? null
    if (typeof body.stock_qty === 'number') update.stock_qty = body.stock_qty
    if ('model_compatibility' in body) update.model_compatibility = body.model_compatibility ?? null

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true })
    }

    const { data, error } = await supabase
      .from('parts')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ part: data })
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

    const { error } = await supabase.from('parts').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
