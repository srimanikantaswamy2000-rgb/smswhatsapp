import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listAppointments, setAppointmentStatus, type Appointment } from './queries'

interface FakeState {
  fromTable: string | null
  selectArgs: unknown[][]
  gteArgs: unknown[][]
  lteArgs: unknown[][]
  eqArgs: unknown[][]
  orderArgs: [string, unknown][]
  updatePayload: Record<string, unknown> | null
  updateEqArgs: unknown[][]
}

function makeQueryBuilder(rows: Appointment[], state: FakeState) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qb: any = {
    select: (...args: unknown[]) => {
      state.selectArgs.push(args)
      return qb
    },
    gte: (...args: unknown[]) => {
      state.gteArgs.push(args)
      return qb
    },
    lte: (...args: unknown[]) => {
      state.lteArgs.push(args)
      return qb
    },
    eq: (...args: unknown[]) => {
      state.eqArgs.push(args)
      return qb
    },
    order: (col: string, opts: unknown) => {
      state.orderArgs.push([col, opts])
      return qb
    },
    then: (resolve: (v: { data: Appointment[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: rows, error: null })),
  }
  return qb
}

function makeDb(rows: Appointment[] = []) {
  const state: FakeState = {
    fromTable: null,
    selectArgs: [],
    gteArgs: [],
    lteArgs: [],
    eqArgs: [],
    orderArgs: [],
    updatePayload: null,
    updateEqArgs: [],
  }
  const db = {
    from: (table: string) => {
      state.fromTable = table
      return {
        select: (...args: unknown[]) => {
          state.selectArgs.push(args)
          return makeQueryBuilder(rows, state)
        },
        update: (payload: Record<string, unknown>) => {
          state.updatePayload = payload
          return {
            eq: (...args: unknown[]) => {
              state.updateEqArgs.push(args)
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  }
  return { db: db as unknown as SupabaseClient, state }
}

describe('listAppointments', () => {
  it('queries the appointments table ordered by requested_time', async () => {
    const { db, state } = makeDb([])
    await listAppointments(db, {})
    expect(state.fromTable).toBe('appointments')
    expect(state.orderArgs).toEqual([['requested_time', { ascending: true }]])
    expect(state.gteArgs).toEqual([])
    expect(state.lteArgs).toEqual([])
    expect(state.eqArgs).toEqual([])
  })

  it('filters by requested_time range', async () => {
    const { db, state } = makeDb([])
    await listAppointments(db, {
      from: '2026-07-12T00:00:00Z',
      to: '2026-07-13T00:00:00Z',
    })
    expect(state.gteArgs).toEqual([['requested_time', '2026-07-12T00:00:00Z']])
    expect(state.lteArgs).toEqual([['requested_time', '2026-07-13T00:00:00Z']])
  })

  it('filters by status', async () => {
    const { db, state } = makeDb([])
    await listAppointments(db, { status: 'booked' })
    expect(state.eqArgs).toEqual([['status', 'booked']])
  })

  it('returns the rows from the query', async () => {
    const rows: Appointment[] = [
      {
        id: 'a1',
        user_id: 'u1',
        contact_id: null,
        phone: '+15551234567',
        customer_name: 'Jane',
        requested_time: '2026-07-12T10:00:00Z',
        status: 'booked',
        created_at: '2026-07-01T00:00:00Z',
      },
    ]
    const { db } = makeDb(rows)
    const result = await listAppointments(db, {})
    expect(result).toEqual(rows)
  })
})

describe('setAppointmentStatus', () => {
  it('updates the status of the row by id', async () => {
    const { db, state } = makeDb([])
    await setAppointmentStatus(db, 'a1', 'completed')
    expect(state.fromTable).toBe('appointments')
    expect(state.updatePayload).toEqual({ status: 'completed' })
    expect(state.updateEqArgs).toEqual([['id', 'a1']])
  })
})
