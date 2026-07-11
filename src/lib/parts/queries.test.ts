import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listParts, upsertPart, type Part } from './queries'

interface FakeState {
  fromTable: string | null
  selectArgs: unknown[][]
  orArgs: unknown[]
  orderArgs: [string, unknown][]
  upsertPayload: Record<string, unknown> | null
  upsertOptions: Record<string, unknown> | null
}

function makeQueryBuilder(rows: Part[], state: FakeState) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qb: any = {
    select: (...args: unknown[]) => {
      state.selectArgs.push(args)
      return qb
    },
    or: (expr: unknown) => {
      state.orArgs.push(expr)
      return qb
    },
    order: (col: string, opts: unknown) => {
      state.orderArgs.push([col, opts])
      return qb
    },
    then: (resolve: (v: { data: Part[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: rows, error: null })),
  }
  return qb
}

function makeDb(rows: Part[] = [], upsertResult: Part | null = null) {
  const state: FakeState = {
    fromTable: null,
    selectArgs: [],
    orArgs: [],
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

describe('listParts', () => {
  it('queries the parts table ordered by part_number', async () => {
    const { db, state } = makeDb([])
    await listParts(db, {})
    expect(state.fromTable).toBe('parts')
    expect(state.orderArgs).toEqual([['part_number', { ascending: true }]])
    expect(state.orArgs).toEqual([])
  })

  it('applies a search filter across part_number and part_name', async () => {
    const { db, state } = makeDb([])
    await listParts(db, { search: 'filter' })
    expect(state.orArgs).toEqual([
      'part_number.ilike.%filter%,part_name.ilike.%filter%',
    ])
  })

  it('returns the rows from the query', async () => {
    const rows: Part[] = [
      {
        id: 'p1',
        part_number: 'A1',
        part_name: 'Air Filter',
        category: 'filters',
        price: 100,
        stock_qty: 10,
        model_compatibility: ['X1'],
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]
    const { db } = makeDb(rows)
    const result = await listParts(db, {})
    expect(result).toEqual(rows)
  })
})

describe('upsertPart', () => {
  it('upserts on user_id,part_number and includes the caller as user_id', async () => {
    const { db, state } = makeDb([])
    await upsertPart(db, {
      part_number: 'A1',
      part_name: 'Air Filter',
      category: 'filters',
      price: 100,
      stock_qty: 10,
      model_compatibility: ['X1'],
    })
    expect(state.fromTable).toBe('parts')
    expect(state.upsertPayload).toMatchObject({
      user_id: 'u1',
      part_number: 'A1',
    })
    expect(state.upsertOptions).toEqual({ onConflict: 'user_id,part_number' })
  })

  it('returns the upserted row', async () => {
    const upserted: Part = {
      id: 'p1',
      part_number: 'A1',
      part_name: 'Air Filter',
      category: 'filters',
      price: 100,
      stock_qty: 10,
      model_compatibility: ['X1'],
      updated_at: '2026-01-01T00:00:00Z',
    }
    const { db } = makeDb([], upserted)
    const result = await upsertPart(db, {
      part_number: 'A1',
      part_name: 'Air Filter',
      category: 'filters',
      price: 100,
      stock_qty: 10,
      model_compatibility: ['X1'],
    })
    expect(result).toEqual(upserted)
  })
})
