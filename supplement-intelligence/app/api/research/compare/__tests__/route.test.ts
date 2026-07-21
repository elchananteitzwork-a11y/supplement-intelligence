// Rewritten (2026-07-2x) for the real `analyses` pipeline rewrite — the old
// fixtures (investment_theses/market_signals/adversarial_debates/
// investment_memos, zero real rows in production) are gone. Fixtures below
// are shaped like real `analyses` rows / MemoData, mirroring the
// "minimal-but-complete MemoData fixture" convention already established by
// lib/watchlist/__tests__/enrich.test.ts's own baseMemo().
//
// Preserves the SPIRIT of the old regression suite:
//   - null-not-fabricated evidence: market_revenue_mo/median_price/etc. are
//     null (not 0) when signal_evidence is absent.
//   - real-vs-never-checked disclosure: kill_criteria_clear is null (never a
//     fabricated true) until the analysis is actually watchlisted, and only
//     reflects a real triggered/watching state once a genuine
//     watchlist_alerts row exists — same HONESTY CAVEAT
//     components/pi/candidate-core/coreDataAdapter.ts's buildKillCriteria
//     already encodes, reused verbatim here (not reimplemented).
//   - confidence/age pass through correctly (confidencePct, created_at).
//   - verdict/qualityTier are null (backward compat), never fabricated, for
//     memo_data that predates market_verdict.
//   - auth scoping: ids not owned by the requesting user are silently
//     excluded, never leaked.

import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { MemoData } from '@/types/index'
import type { AggregatedSignals } from '@/lib/signal-engine/types'

vi.mock('next/headers', () => ({
  cookies: () => ({
    getAll: () => [],
    get:    () => undefined,
    set:    () => {},
  }),
}))

// ── Minimal-but-complete MemoData fixture (mirrors lib/watchlist/__tests__/
// enrich.test.ts's own baseMemo) — computeGroundedScore() reads m.scores.*
// unconditionally, so every fixture needs this much even when it carries no
// real evidence at all.
function baseMemo(overrides: Partial<MemoData> = {}): MemoData {
  return {
    category_name:      'Magnesium Glycinate',
    executive_summary:  '',
    build_decision:     'VALIDATE_FURTHER',
    build_explanation:  '',
    opportunity_score:  54,
    scores: {
      demand:        { level: 'Medium', notes: '' },
      virality:      { level: 'Medium', notes: '' },
      subscription:  { level: 'Medium', notes: '' },
      manufacturing: { level: 'Medium', notes: '' },
    },
    biggest_competitor: { name: '', revenue: '', gap: '' },
    market_size:        '',
    gross_margin:       '',
    market_gaps:        [],
    brand_opportunities: [],
    customer_language:  { frustrations: [], desires: [], fears: [], ad_phrases: [] },
    product_recommendation: {
      format: '', dosing: '', formula: [], avoid: [], cogs_estimate: '', retail_price: '', gross_margin: '',
    },
    financial_projections: { gross_margin: '', net_margin_at_scale: '', path_to_10m: '' },
    ...overrides,
  } as MemoData
}

const OLD_DATE = new Date(Date.now() - 12 * 86_400_000).toISOString()
const NEW_DATE = new Date().toISOString()

const killCriteria = [
  { key: 'gap_velocity_negative', label: 'Gap velocity turns negative', metric: 'gap_velocity' as const, comparator: 'lt' as const, threshold: 0, valueAtGeneration: 3 },
]

const signalEvidenceA: AggregatedSignals = {
  revenue: {
    value: { score: 7, confidence: 0.8, est_monthly_revenue: '60000', avg_referral_fee_pct: 15, avg_fba_pick_pack_fee: '$4.25' },
    sources: ['keepa'], primarySource: 'keepa', confidence: 0.8,
  },
  review_velocity: {
    value: { score: 6, confidence: 0.75, meaningful_competitor_count: 8, review_concentration_ratio: 0.55 },
    sources: ['apify-amazon-search'], primarySource: 'apify-amazon-search', confidence: 0.75,
  },
  pricing: {
    value: { score: 6, confidence: 0.7, avg_price: '$28' },
    sources: ['keepa'], primarySource: 'keepa', confidence: 0.7,
  },
  growth: {
    value: { score: 7, confidence: 0.8, momentum_90d_pct: 6 },
    sources: ['keepa'], primarySource: 'keepa', confidence: 0.8,
  },
  virality: {
    value: { score: 5, confidence: 0.6, view_count: 1_200_000, hashtag: 'magnesium' },
    sources: ['tiktok'], primarySource: 'tiktok', confidence: 0.6,
  },
  providers_used: ['keepa', 'apify-amazon-search', 'tiktok'],
  overall_confidence: 0.75,
}

// 00000000-0000-4000-8000-000000000a01: full real evidence, real verdict, real kill criteria, watched
// with one triggered alert.
const memoA = baseMemo({
  signal_evidence: signalEvidenceA,
  market_verdict: { verdict: 'BUILD_NOW', qualityTier: 'High', lifecycleStage: 'Window Open', buildNowGate: null, version: 'heuristic-v1' },
  kill_criteria: killCriteria,
})

// 00000000-0000-4000-8000-000000000b02: no evidence at all, no market_verdict (pre-M2.4 memo), no kill
// criteria — the exact "nothing to fabricate from" case.
const memoB = baseMemo({})

const analysesById: Record<string, Record<string, unknown>> = {
  '00000000-0000-4000-8000-000000000a01': {
    id: '00000000-0000-4000-8000-000000000a01', user_id: 'user-1', created_at: OLD_DATE,
    category_name: 'Magnesium Glycinate', memo_data: memoA,
  },
  '00000000-0000-4000-8000-000000000b02': {
    id: '00000000-0000-4000-8000-000000000b02', user_id: 'user-1', created_at: NEW_DATE,
    category_name: 'Ashwagandha Gummies', memo_data: memoB,
  },
  // belongs to a different user — must never be returned to user-1
  '00000000-0000-4000-8000-0000000000c1': {
    id: '00000000-0000-4000-8000-0000000000c1', user_id: 'user-2', created_at: NEW_DATE,
    category_name: 'Someone Else’s Analysis', memo_data: baseMemo({}),
  },
}

let watchlistRows: Record<string, unknown>[] = []
let alertRows: Record<string, unknown>[] = []

function makeQueryBuilder(resolve: (state: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const state: Record<string, unknown> = {}
  const builder = {
    select: () => builder,
    eq:     (col: string, val: unknown) => { state[col] = val; return builder },
    in:     (col: string, vals: unknown) => { state[`${col}_in`] = vals; return builder },
    order:  () => builder,
    limit:  () => builder,
    maybeSingle: async () => resolve(state),
    single:      async () => resolve(state),
    then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolve(state)).then(onFulfilled, onRejected),
  }
  return builder
}

function makeSupabaseMock() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table: string) => {
      if (table === 'analyses') {
        return makeQueryBuilder(state => {
          const ids = (state.id_in as string[]) ?? []
          const userId = state.user_id as string
          const data = ids.map(id => analysesById[id]).filter(Boolean).filter(a => a!.user_id === userId)
          return { data, error: null }
        })
      }
      if (table === 'watchlist') {
        return makeQueryBuilder(() => ({ data: watchlistRows, error: null }))
      }
      if (table === 'watchlist_alerts') {
        return makeQueryBuilder(() => ({ data: alertRows, error: null }))
      }
      return makeQueryBuilder(() => ({ data: null, error: null }))
    },
  }
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => makeSupabaseMock(),
}))

describe('GET /api/research/compare', () => {
  it('rejects fewer than 2 ids', async () => {
    watchlistRows = []
    alertRows = []
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/research/compare?ids=00000000-0000-4000-8000-000000000a01')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('rejects a malformed (non-UUID) id with a 400, not a raw 500 from Postgres (pre-beta audit fix)', async () => {
    watchlistRows = []
    alertRows = []
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/research/compare?ids=bad,ids')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns null (not fabricated 0) evidence fields when signal_evidence is absent', async () => {
    watchlistRows = []
    alertRows = []
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/research/compare?ids=00000000-0000-4000-8000-000000000a01,00000000-0000-4000-8000-000000000b02')
    const res = await GET(req)
    const body = await res.json()
    expect(res.status).toBe(200)

    const itemB = body.items.find((i: { analysis_id: string }) => i.analysis_id === '00000000-0000-4000-8000-000000000b02')
    expect(itemB.market_revenue_mo).toBeNull()
    expect(itemB.median_price).toBeNull()
    expect(itemB.competitor_count).toBeNull()
    expect(itemB.tiktok_view_count).toBeNull()
  })

  it('derives real evidence numbers via adaptAggregatedSignals when signal_evidence is present', async () => {
    watchlistRows = []
    alertRows = []
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/research/compare?ids=00000000-0000-4000-8000-000000000a01,00000000-0000-4000-8000-000000000b02')
    const res = await GET(req)
    const body = await res.json()

    const itemA = body.items.find((i: { analysis_id: string }) => i.analysis_id === '00000000-0000-4000-8000-000000000a01')
    expect(itemA.market_revenue_mo).toBe(60000)
    expect(itemA.median_price).toBe(28)
    expect(itemA.competitor_count).toBe(8)
    expect(itemA.review_concentration).toBe(0.55)
    expect(itemA.momentum_90d_pct).toBe(6)
    expect(itemA.tiktok_view_count).toBe(1_200_000)
  })

  it('returns null verdict/qualityTier (never fabricated) for memo_data that predates market_verdict', async () => {
    watchlistRows = []
    alertRows = []
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/research/compare?ids=00000000-0000-4000-8000-000000000a01,00000000-0000-4000-8000-000000000b02')
    const res = await GET(req)
    const body = await res.json()

    const itemB = body.items.find((i: { analysis_id: string }) => i.analysis_id === '00000000-0000-4000-8000-000000000b02')
    expect(itemB.verdict).toBeNull()
    expect(itemB.qualityTier).toBeNull()

    const itemA = body.items.find((i: { analysis_id: string }) => i.analysis_id === '00000000-0000-4000-8000-000000000a01')
    expect(itemA.verdict).toBe('BUILD_NOW')
    expect(itemA.qualityTier).toBe('High')
  })

  it('passes through real created_at and a real confidencePct', async () => {
    watchlistRows = []
    alertRows = []
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/research/compare?ids=00000000-0000-4000-8000-000000000a01,00000000-0000-4000-8000-000000000b02')
    const res = await GET(req)
    const body = await res.json()

    const itemA = body.items.find((i: { analysis_id: string }) => i.analysis_id === '00000000-0000-4000-8000-000000000a01')
    expect(itemA.created_at).toBe(OLD_DATE)
    expect(typeof itemA.confidencePct === 'number' || itemA.confidencePct === null).toBe(true)
  })

  it('kill_criteria_clear is null when criteria exist but the analysis is never watchlisted', async () => {
    watchlistRows = []
    alertRows = []
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/research/compare?ids=00000000-0000-4000-8000-000000000a01,00000000-0000-4000-8000-000000000b02')
    const res = await GET(req)
    const body = await res.json()

    const itemA = body.items.find((i: { analysis_id: string }) => i.analysis_id === '00000000-0000-4000-8000-000000000a01')
    expect(itemA.kill_criteria_clear).toBeNull()
    expect(itemA.triggered_kill_criteria).toEqual([])

    // no criteria at all for 00000000-0000-4000-8000-000000000b02
    const itemB = body.items.find((i: { analysis_id: string }) => i.analysis_id === '00000000-0000-4000-8000-000000000b02')
    expect(itemB.kill_criteria_clear).toBeNull()
  })

  it('kill_criteria_clear is true once watchlisted with no triggered alert', async () => {
    watchlistRows = [{ id: 'watch-1', analysis_id: '00000000-0000-4000-8000-000000000a01', user_id: 'user-1', active: true, kill_criteria: killCriteria }]
    alertRows = []
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/research/compare?ids=00000000-0000-4000-8000-000000000a01,00000000-0000-4000-8000-000000000b02')
    const res = await GET(req)
    const body = await res.json()

    const itemA = body.items.find((i: { analysis_id: string }) => i.analysis_id === '00000000-0000-4000-8000-000000000a01')
    expect(itemA.kill_criteria_clear).toBe(true)
    expect(itemA.triggered_kill_criteria).toEqual([])
  })

  it('kill_criteria_clear is false + names the real triggered criterion once a matching watchlist_alerts row exists', async () => {
    watchlistRows = [{ id: 'watch-1', analysis_id: '00000000-0000-4000-8000-000000000a01', user_id: 'user-1', active: true, kill_criteria: killCriteria }]
    alertRows = [{ id: 'alert-1', watchlist_id: 'watch-1', user_id: 'user-1', alert_type: 'kill_criteria_triggered', kill_criterion_key: 'gap_velocity_negative', kill_criterion_label: 'Gap velocity turns negative' }]
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/research/compare?ids=00000000-0000-4000-8000-000000000a01,00000000-0000-4000-8000-000000000b02')
    const res = await GET(req)
    const body = await res.json()

    const itemA = body.items.find((i: { analysis_id: string }) => i.analysis_id === '00000000-0000-4000-8000-000000000a01')
    expect(itemA.kill_criteria_clear).toBe(false)
    expect(itemA.triggered_kill_criteria).toEqual(['Gap velocity turns negative'])
  })

  it('never returns an analysis id owned by a different user', async () => {
    watchlistRows = []
    alertRows = []
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/research/compare?ids=00000000-0000-4000-8000-000000000a01,00000000-0000-4000-8000-0000000000c1')
    const res = await GET(req)
    const body = await res.json()
    // only one real, owned row survives -> below the 2-item minimum -> 400
    expect(res.status).toBe(400)
  })
})
