import type { SupabaseClient } from '@supabase/supabase-js'

export interface Part {
  id: string
  part_number: string
  part_name: string | null
  category: string | null
  price: number | null
  stock_qty: number
  model_compatibility: string[] | null
  updated_at: string
}

type DB = SupabaseClient

export interface ListPartsFilters {
  search?: string
}

export async function listParts(db: DB, { search }: ListPartsFilters): Promise<Part[]> {
  let query = db.from('parts').select('*')

  if (search && search.trim()) {
    const like = `%${search.trim()}%`
    query = query.or(`part_number.ilike.${like},part_name.ilike.${like}`)
  }

  const { data, error } = await query.order('part_number', { ascending: true })
  if (error) throw error
  return (data ?? []) as Part[]
}

export async function upsertPart(
  db: DB,
  part: Omit<Part, 'id' | 'updated_at'> & { id?: string },
): Promise<Part> {
  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await db
    .from('parts')
    .upsert({ ...part, user_id: user.id }, { onConflict: 'user_id,part_number' })
    .select()
    .single()
  if (error) throw error
  return data as Part
}
