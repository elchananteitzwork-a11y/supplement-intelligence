// Store tests — Roadmap M2.7. Mocks @supabase/supabase-js (same lazy
// service-role client pattern as lib/provider-cache/index.ts, which itself
// has no dedicated test file — this is the first real test coverage for
// this exact pattern in this codebase).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const maybeSingle = vi.fn()
const limit  = vi.fn(() => ({ maybeSingle }))
const order  = vi.fn(() => ({ limit }))
const neq    = vi.fn(() => ({ order }))
const eq     = vi.fn(() => ({ neq }))
const select = vi.fn(() => ({ eq }))
const upsert = vi.fn()
const from   = vi.fn(() => ({ select, upsert }))

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from })) }))

const ORIGINAL_ENV = { ...process.env }

describe('getPreviousTopicPostCount / writeClusterRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })
  afterEach(() => { process.env = { ...ORIGINAL_ENV } })

  it('returns null (no fabricated baseline) when Supabase env vars are not configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    vi.resetModules()
    const { getPreviousTopicPostCount } = await import('../store')
    expect(await getPreviousTopicPostCount('perimenopause_hormonal', '2026-W29')).toBeNull()
  })

  it('returns the real prior post_count when a row exists', async () => {
    maybeSingle.mockResolvedValue({ data: { post_count: 12, run_week: '2026-W28' }, error: null })
    const { getPreviousTopicPostCount } = await import('../store')
    const count = await getPreviousTopicPostCount('perimenopause_hormonal', '2026-W29')
    expect(count).toBe(12)
    expect(eq).toHaveBeenCalledWith('topic_key', 'perimenopause_hormonal')
    expect(neq).toHaveBeenCalledWith('run_week', '2026-W29')
  })

  it('returns null when no prior row exists', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    const { getPreviousTopicPostCount } = await import('../store')
    expect(await getPreviousTopicPostCount('perimenopause_hormonal', '2026-W29')).toBeNull()
  })

  it('upserts rows on (run_week, topic_key) conflict for idempotent retries', async () => {
    upsert.mockResolvedValue({ error: null })
    const { writeClusterRun } = await import('../store')
    const rows = [{
      run_week: '2026-W29', topic_key: 'perimenopause_hormonal', topic_label: 'Perimenopause', post_count: 5,
      avg_engagement_score: 10, trend_pct: null, rank: 1, sample_quotes: [], subreddits_seen: [], pipeline_version: 'heuristic-v1',
    }]
    await writeClusterRun(rows)
    expect(upsert).toHaveBeenCalledWith(rows, { onConflict: 'run_week,topic_key' })
  })

  it('never throws when the write fails (non-fatal, matching provider-cache/verdict-ledger convention)', async () => {
    upsert.mockResolvedValue({ error: { message: 'db down' } })
    const { writeClusterRun } = await import('../store')
    await expect(writeClusterRun([{
      run_week: '2026-W29', topic_key: 'x', topic_label: 'X', post_count: 1, avg_engagement_score: 1,
      trend_pct: null, rank: 1, sample_quotes: [], subreddits_seen: [], pipeline_version: 'heuristic-v1',
    }])).resolves.toBeUndefined()
  })

  it('is a no-op for an empty row list', async () => {
    const { writeClusterRun } = await import('../store')
    await writeClusterRun([])
    expect(upsert).not.toHaveBeenCalled()
  })
})
