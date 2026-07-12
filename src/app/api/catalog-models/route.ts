import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { listModels, upsertModel } from '@/lib/catalog/queries'

// Tractor/harvester catalog — per-user model list (RLS-scoped by
// `user_id`, see migration 039_catalog_models.sql). GET lists all
// models ordered by name; POST creates or updates (see upsertModel).

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()
    const models = await listModels(supabase)
    return NextResponse.json({ models })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await getCurrentAccount()

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const model_name = typeof body.model_name === 'string' ? body.model_name.trim() : ''
    if (!model_name) {
      return NextResponse.json({ error: 'model_name is required' }, { status: 400 })
    }

    const type = body.type === 'harvester' ? 'harvester' : 'tractor'

    const model = await upsertModel(supabase, {
      model_name,
      type,
      hp: typeof body.hp === 'number' ? body.hp : null,
      price_min: typeof body.price_min === 'number' ? body.price_min : null,
      price_max: typeof body.price_max === 'number' ? body.price_max : null,
      features: typeof body.features === 'string' ? body.features : null,
    })
    return NextResponse.json({ model }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
