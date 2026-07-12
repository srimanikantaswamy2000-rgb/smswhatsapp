import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// Update / delete a single catalog model. RLS (`auth.uid() = user_id`
// on the `catalog_models` table, see migration 039_catalog_models.sql)
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

    const update: Record<string, unknown> = {}
    if (typeof body.model_name === 'string') {
      const model_name = body.model_name.trim()
      if (!model_name) return NextResponse.json({ error: 'model_name cannot be empty' }, { status: 400 })
      update.model_name = model_name
    }
    if (body.type === 'tractor' || body.type === 'harvester') update.type = body.type
    if ('hp' in body) update.hp = body.hp ?? null
    if ('price_min' in body) update.price_min = body.price_min ?? null
    if ('price_max' in body) update.price_max = body.price_max ?? null
    if ('features' in body) update.features = body.features ?? null

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true })
    }

    const { data, error } = await supabase
      .from('catalog_models')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ model: data })
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

    const { error } = await supabase.from('catalog_models').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
