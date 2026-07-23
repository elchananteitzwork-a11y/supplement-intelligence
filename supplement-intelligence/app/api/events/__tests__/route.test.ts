import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: () => ({
    getAll: () => [],
    get:    () => undefined,
    set:    () => {},
  }),
}))

let currentUser: { id: string } | null = { id: 'user-1' }
let insertError: { code?: string; message?: string } | null = null
let capturedInsertRow: Record<string, unknown> | null = null
// Analyses the mock treats as existing AND owned by the caller — the
// route's ownership check (select id where id + user_id match) resolves
// non-null only for ids listed here.
let ownedAnalysisIds: string[] = ['a1']

function makeSupabaseMock() {
  return {
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table !== 'product_events') return { data: null, error: null }
        capturedInsertRow = row
        return { data: insertError ? null : {}, error: insertError }
      },
      select: () => {
        const filters: Record<string, unknown> = {}
        const chain = {
          eq: (col: string, val: unknown) => { filters[col] = val; return chain },
          maybeSingle: async () => {
            if (table !== 'analyses') return { data: null, error: null }
            const owned = ownedAnalysisIds.includes(filters.id as string) && filters.user_id === currentUser?.id
            return { data: owned ? { id: filters.id } : null, error: null }
          },
        }
        return chain
      },
    }),
  }
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => makeSupabaseMock(),
}))

beforeEach(() => {
  currentUser = { id: 'user-1' }
  insertError = null
  capturedInsertRow = null
  ownedAnalysisIds = ['a1']
})

describe('POST /api/events', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUser = null
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/events', { method: 'POST', body: JSON.stringify({ event: 'verdict_viewed' }) }))
    expect(res.status).toBe(401)
  })

  it('rejects an event outside the closed Phase-1 set with a 400', async () => {
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/events', { method: 'POST', body: JSON.stringify({ event: 'page_view' }) }))
    expect(res.status).toBe(400)
  })

  it('rejects a missing event with a 400', async () => {
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/events', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(400)
  })

  it('rejects invalid JSON with a 400, not a raw crash', async () => {
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/events', { method: 'POST', body: 'not json' }))
    expect(res.status).toBe(400)
  })

  it('inserts the real event (with a null analysisId when absent) and returns 204 with no body', async () => {
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/events', { method: 'POST', body: JSON.stringify({ event: 'verdict_viewed' }) }))
    expect(res.status).toBe(204)
    expect(capturedInsertRow).toEqual({ user_id: 'user-1', event: 'verdict_viewed', analysis_id: null })
  })

  it('inserts the real analysisId when provided and owned by the caller', async () => {
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/events', { method: 'POST', body: JSON.stringify({ event: 'claim_tapped', analysisId: 'a1' }) }))
    expect(res.status).toBe(204)
    expect(capturedInsertRow).toEqual({ user_id: 'user-1', event: 'claim_tapped', analysis_id: 'a1' })
  })

  it('rejects an analysisId the caller does not own with a 404 and writes nothing (security-review advisory)', async () => {
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/events', { method: 'POST', body: JSON.stringify({ event: 'claim_tapped', analysisId: 'someone-elses-id' }) }))
    expect(res.status).toBe(404)
    expect(capturedInsertRow).toBeNull()
  })

  it('returns an honest 503 (never a crash) when the product_events table does not exist yet', async () => {
    insertError = { code: 'PGRST205', message: "Could not find the table 'public.product_events' in the schema cache" }
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/events', { method: 'POST', body: JSON.stringify({ event: 'verdict_viewed' }) }))
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body.error).toMatch(/migration/i)
  })
})
