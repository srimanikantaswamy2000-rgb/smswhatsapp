import type { SupabaseClient } from '@supabase/supabase-js'

export interface CatalogModel {
  id: string
  user_id: string
  model_name: string
  type: 'tractor' | 'harvester'
  hp: number | null
  price_min: number | null
  price_max: number | null
  features: string | null
}

type DB = SupabaseClient

export async function listModels(db: DB): Promise<CatalogModel[]> {
  const { data, error } = await db
    .from('catalog_models')
    .select('*')
    .order('model_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as CatalogModel[]
}

export async function upsertModel(
  db: DB,
  model: Omit<CatalogModel, 'id' | 'user_id'> & { id?: string },
): Promise<CatalogModel> {
  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await db
    .from('catalog_models')
    .upsert({ ...model, user_id: user.id }, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data as CatalogModel
}
