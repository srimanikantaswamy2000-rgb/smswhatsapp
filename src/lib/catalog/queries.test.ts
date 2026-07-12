import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listModels, upsertModel, type CatalogModel } from './queries'

interface FakeState {
  fromTable: string | null
  selectArgs: unknown[][]
  orderArgs: [string, unknown][]
  upsertPayload: Record<string, unknown> | null
  upsertOptions: Record<string, unknown> | null
}

function makeQueryBuilder(rows: CatalogModel[], state: FakeState) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qb: any = {
    select: (...args: unknown[]) => {
      state.selectArgs.push(args)
      return qb
    },
    order: (col: string, opts: unknown) => {
      state.orderArgs.push([col, opts])
      return qb
    },
    then: (resolve: (v: { data: CatalogModel[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: rows, error: null })),
  }
  return qb
}

function makeDb(rows: CatalogModel[] = [], upsertResult: CatalogModel | null = null) {
  const state: FakeState = {
    fromTable: null,
    selectArgs: [],
    orderArgs: [],
    upsertPayload: null,
    upsertOptions: null,
  }
  const db = {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
    },
    from: (table: string) => {
      state.fromTable = table
      return {
        select: (...args: unknown[]) => {
          state.selectArgs.push(args)
          return makeQueryBuilder(rows, state)
        },
        upsert: (payload: Record<string, unknown>, opts: Record<string, unknown>) => {
          state.upsertPayload = payload
          state.upsertOptions = opts
          return {
            select: () => ({
              single: () =>
                Promise.resolve({ data: upsertResult ?? payload, error: null }),
            }),
          }
        },
      }
    },
  }
  return { db: db as unknown as SupabaseClient, state }
}

describe('listModels', () => {
  it('queries the catalog_models table ordered by model_name', async () => {
    const { db, state } = makeDb([])
    await listModels(db)
    expect(state.fromTable).toBe('catalog_models')
    expect(state.orderArgs).toEqual([['model_name', { ascending: true }]])
  })

  it('returns the rows from the query', async () => {
    const rows: CatalogModel[] = [
      {
        id: 'm1',
        user_id: 'u1',
        model_name: 'Trakstar 5000',
        type: 'tractor',
        hp: 50,
        price_min: 500000,
        price_max: 600000,
        features: '4WD, power steering',
      },
    ]
    const { db } = makeDb(rows)
    const result = await listModels(db)
    expect(result).toEqual(rows)
  })
})

describe('upsertModel', () => {
  it('upserts and includes the caller as user_id', async () => {
    const { db, state } = makeDb([])
    await upsertModel(db, {
      model_name: 'Trakstar 5000',
      type: 'tractor',
      hp: 50,
      price_min: 500000,
      price_max: 600000,
      features: '4WD, power steering',
    })
    expect(state.fromTable).toBe('catalog_models')
    expect(state.upsertPayload).toMatchObject({
      user_id: 'u1',
      model_name: 'Trakstar 5000',
    })
    expect(state.upsertOptions).toEqual({ onConflict: 'id' })
  })

  it('returns the upserted row', async () => {
    const upserted: CatalogModel = {
      id: 'm1',
      user_id: 'u1',
      model_name: 'Trakstar 5000',
      type: 'tractor',
      hp: 50,
      price_min: 500000,
      price_max: 600000,
      features: '4WD, power steering',
    }
    const { db } = makeDb([], upserted)
    const result = await upsertModel(db, {
      model_name: 'Trakstar 5000',
      type: 'tractor',
      hp: 50,
      price_min: 500000,
      price_max: 600000,
      features: '4WD, power steering',
    })
    expect(result).toEqual(upserted)
  })
})
