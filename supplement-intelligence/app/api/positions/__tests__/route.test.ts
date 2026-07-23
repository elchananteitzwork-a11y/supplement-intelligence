// Mirrors app/api/research/compare/__tests__/route.test.ts's real mock shape
// (a minimal chainable query-builder standing in for supabase-js), extended
// with insert/upsert for this route's write path.

import { describe, it, expect, vi, beforeEach } from 'vitest'
// Registers the real category modules (side effect) — app/api/positions/
// route.ts imports categoryRegistry directly (same pattern as
// app/api/watchlist/route.ts's own POST), which is only populated once
// something has imported lib/categories/index.ts's registration side
// effects at least once in the process (real production entry points:
// app/api/generate/route.ts, app/api/discover/route.ts).
import '@/lib/categories'

vi.mock('next/headers', () => ({
  cookies: () => ({
    getAll: () => [],
    get:    () => undefined,
    set:    () => {},
  }),
}))

const addWatchMock = vi.fn(async (_sb: unknown, userId: string, input: unknown) => ({ id: 'w1' }))
vi.mock('@/lib/watchlist/store', () => ({
  addWatch: (sb: unknown, userId: string, input: unknown) => addWatchMock(sb, userId, input),
}))

let currentUser: { id: string } | null = { id: 'user-1' }
let positionRows: Record<string, unknown>[] = []
let analysesById: Record<string, Record<string, unknown>> = {}
let positionsError: { code?: string; message?: string } | null = null
let upsertResultRow: Record<string, unknown> | null = null
let capturedPositionsUpsertRow: Record<string, unknown> | null = null

function makeQueryBuilder(resolve: (state: Record<string, unknown>) => { data: unknown; error: unknown }, onUpsert?: (row: unknown) => void) {
  const state: Record<string, unknown> = {}
  const builder = {
    select: (cols: string) => { state.select = cols; return builder },
    eq:     (col: string, val: unknown) => { state[col] = val; return builder },
    in:     (col: string, vals: unknown) => { state[`${col}_in`] = vals; return builder },
    order:  () => builder,
    upsert: (row: unknown, opts: unknown) => { state.upsertRow = row; state.upsertOpts = opts; onUpsert?.(row); return builder },
    maybeSingle: async () => resolve(state),
    single:      async () => resolve(state),
    then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolve(state)).then(onFulfilled, onRejected),
  }
  return builder
}

function makeSupabaseMock() {
  return {
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
    from: (table: string) => {
      if (table === 'positions') {
        return makeQueryBuilder(state => {
          if (state.upsertRow) {
            if (positionsError) return { data: null, error: positionsError }
            return { data: upsertResultRow, error: null }
          }
          if (positionsError) return { data: null, error: positionsError }
          const userId = state.user_id as string
          return { data: positionRows.filter(r => r.user_id === userId), error: null }
        }, row => { capturedPositionsUpsertRow = row as Record<string, unknown> })
      }
      if (table === 'analyses') {
        return makeQueryBuilder(state => {
          if (state.id_in) {
            const ids = state.id_in as string[]
            return { data: ids.map(id => analysesById[id]).filter(Boolean), error: null }
          }
          const id = state.id as string
          const userId = state.user_id as string
          const a = analysesById[id]
          if (a && a.user_id === userId) return { data: a, error: null }
          return { data: null, error: null }
        })
      }
      return makeQueryBuilder(() => ({ data: null, error: null }))
    },
  }
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => makeSupabaseMock(),
}))

beforeEach(() => {
  currentUser = { id: 'user-1' }
  positionRows = []
  analysesById = {}
  positionsError = null
  upsertResultRow = null
  capturedPositionsUpsertRow = null
  addWatchMock.mockClear()
})

describe('GET /api/positions', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUser = null
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns the caller own positions joined with real category_name/decision', async () => {
    positionRows = [{ user_id: 'user-1', analysis_id: 'a1', state: 'watching', success_metrics: ['3 sales in 30 days'], kill_reason: null, created_at: '2026-01-01T00:00:00.000Z' }]
    analysesById = { a1: { id: 'a1', user_id: 'user-1', category_name: 'Magnesium Glycinate', build_decision: 'BUILD_NOW' } }
    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.positions).toEqual([{
      analysisId: 'a1', state: 'watching', successMetrics: ['3 sales in 30 days'], killReason: null,
      createdAt: '2026-01-01T00:00:00.000Z', categoryName: 'Magnesium Glycinate', decision: 'BUILD_NOW',
    }])
  })

  it('returns an honest 503 (never a crash) when the positions table does not exist yet', async () => {
    positionsError = { code: 'PGRST205', message: "Could not find the table 'public.positions' in the schema cache" }
    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body.error).toMatch(/migration/i)
  })
})

describe('POST /api/positions', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUser = null
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/positions', { method: 'POST', body: JSON.stringify({ analysisId: 'a1', state: 'validating' }) }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when analysisId is missing', async () => {
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/positions', { method: 'POST', body: JSON.stringify({ state: 'validating' }) }))
    expect(res.status).toBe(400)
  })

  it('returns 400 on an invalid state (never silently coerced)', async () => {
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/positions', { method: 'POST', body: JSON.stringify({ analysisId: 'a1', state: 'archived' }) }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the analysis is not found or not owned by the caller', async () => {
    analysesById = {}
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/positions', { method: 'POST', body: JSON.stringify({ analysisId: 'a1', state: 'validating' }) }))
    expect(res.status).toBe(404)
  })

  it('saves a validating position and does NOT touch the watchlist', async () => {
    analysesById = { a1: { id: 'a1', user_id: 'user-1', category_name: 'Ashwagandha', build_decision: 'VALIDATE_FURTHER', memo_data: {} } }
    upsertResultRow = { analysis_id: 'a1', state: 'validating', success_metrics: ['sell 10 units'], kill_reason: null, created_at: '2026-01-02T00:00:00.000Z' }
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/positions', { method: 'POST', body: JSON.stringify({ analysisId: 'a1', state: 'validating', successMetrics: ['sell 10 units'] }) }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.position).toEqual({
      analysisId: 'a1', state: 'validating', successMetrics: ['sell 10 units'], killReason: null,
      createdAt: '2026-01-02T00:00:00.000Z', categoryName: 'Ashwagandha', decision: 'VALIDATE_FURTHER',
    })
    expect(addWatchMock).not.toHaveBeenCalled()
  })

  it('reuses the real watchlist add path (addWatch) when state = watching, never a duplicate mechanism', async () => {
    analysesById = {
      a1: {
        id: 'a1', user_id: 'user-1', category_name: 'Creatine', build_decision: 'BUILD_NOW',
        memo_data: { lifecycle_classification: { stage: 'Window Open' }, kill_criteria: [{ key: 'k1' }] },
      },
    }
    upsertResultRow = { analysis_id: 'a1', state: 'watching', success_metrics: null, kill_reason: null, created_at: '2026-01-03T00:00:00.000Z' }
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/positions', { method: 'POST', body: JSON.stringify({ analysisId: 'a1', state: 'watching' }) }))
    expect(res.status).toBe(200)
    expect(addWatchMock).toHaveBeenCalledTimes(1)
    const call = addWatchMock.mock.calls[0]
    const userId = call[1]
    const input = call[2]
    expect(userId).toBe('user-1')
    expect(input).toMatchObject({
      analysisId: 'a1', categoryName: 'Creatine',
      lifecycleStageAtWatch: 'Window Open', killCriteria: [{ key: 'k1' }],
    })
  })

  it('never persists a kill_reason unless state = killed, even if the client sends one', async () => {
    analysesById = { a1: { id: 'a1', user_id: 'user-1', category_name: 'Creatine', build_decision: 'SKIP', memo_data: {} } }
    upsertResultRow = { analysis_id: 'a1', state: 'validating', success_metrics: null, kill_reason: null, created_at: '2026-01-04T00:00:00.000Z' }
    const { POST } = await import('../route')
    await POST(new Request('http://localhost/api/positions', { method: 'POST', body: JSON.stringify({ analysisId: 'a1', state: 'validating', killReason: 'should be ignored' }) }))
    expect(capturedPositionsUpsertRow).not.toBeNull()
    expect((capturedPositionsUpsertRow as unknown as Record<string, unknown>).kill_reason).toBeNull()
  })

  it('persists the real kill_reason when state = killed', async () => {
    analysesById = { a1: { id: 'a1', user_id: 'user-1', category_name: 'Creatine', build_decision: 'SKIP', memo_data: {} } }
    upsertResultRow = { analysis_id: 'a1', state: 'killed', success_metrics: null, kill_reason: 'margin too thin', created_at: '2026-01-05T00:00:00.000Z' }
    const { POST } = await import('../route')
    await POST(new Request('http://localhost/api/positions', { method: 'POST', body: JSON.stringify({ analysisId: 'a1', state: 'killed', killReason: 'margin too thin' }) }))
    expect(capturedPositionsUpsertRow).not.toBeNull()
    expect((capturedPositionsUpsertRow as unknown as Record<string, unknown>).kill_reason).toBe('margin too thin')
  })

  it('returns an honest 503 when the positions table does not exist yet', async () => {
    analysesById = { a1: { id: 'a1', user_id: 'user-1', category_name: 'Creatine', build_decision: 'SKIP', memo_data: {} } }
    positionsError = { code: 'PGRST205', message: "Could not find the table 'public.positions' in the schema cache" }
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/positions', { method: 'POST', body: JSON.stringify({ analysisId: 'a1', state: 'validating' }) }))
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body.error).toMatch(/migration/i)
  })
})
