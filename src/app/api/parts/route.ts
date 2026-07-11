import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { listParts, upsertPart } from '@/lib/parts/queries'

// Inventory parts — per-user catalog (RLS-scoped by `user_id`, see
// migration 037_parts.sql). GET lists (optionally filtered by
// `?search=`); POST creates or updates on `user_id, part_number`
// conflict (see upsertPart).

export async function GET(request: Request) {
  try {
    const { supabase } = await getCurrentAccount()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') ?? undefined
    const parts = await listParts(supabase, { search })
    return NextResponse.json({ parts })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await getCurrentAccount()

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const part_number = typeof body.part_number === 'string' ? body.part_number.trim() : ''
    if (!part_number) {
      return NextResponse.json({ error: 'part_number is required' }, { status: 400 })
    }

    const part = await upsertPart(supabase, {
      part_number,
      part_name: typeof body.part_name === 'string' ? body.part_name : null,
      category: typeof body.category === 'string' ? body.category : null,
      price: typeof body.price === 'number' ? body.price : null,
      stock_qty: typeof body.stock_qty === 'number' ? body.stock_qty : 0,
      model_compatibility: Array.isArray(body.model_compatibility)
        ? body.model_compatibility
        : null,
    })
    return NextResponse.json({ part }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
