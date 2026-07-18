// Regression test — 2026-07-18 audit follow-up.
//
// Finding 7: `const opportunity_score = evidence ? computeScore(evidence, verdict_code) : 0`
// fabricated a real-looking 0 score when evidence was missing entirely. It
// must be `null` — a real "unscoreable," not a real-looking worst score.
//
// Also exercises Findings 3, 4, 5 end-to-end: fee_data_source,
// signal_created_at, and data_confidence must reach the response.

import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/headers', () => ({
  cookies: () => ({
    getAll: () => [],
    get:    () => undefined,
    set:    () => {},
  }),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
  }),
}))

// ── Fixture data ─────────────────────────────────────────────────────────

function ep<T>(value: T) {
  return { value, source: 'keepa', source_type: 'primary_measurement' as const, freshness_date: new Date().toISOString() }
}

const OLD_SIGNAL_DATE = new Date(Date.now() - 12 * 86_400_000).toISOString()

const evidenceWithRealFees = {
  providers_used:        ep(['keepa']),
  overall_confidence:    ep(0.82),
  est_monthly_revenue:   ep(60_000),
  median_price:          ep(28),
  avg_referral_fee_pct:  ep(15),
  avg_fba_fee:           ep(4.25),
  competitor_count:      ep(8),
  review_concentration:  ep(0.55),
  momentum_90d_pct:      ep(6),
}

const theses: Record<string, Record<string, unknown>> = {
  'thesis-A': {
    id: 'thesis-A',
    market_signal_id: 'signal-A',
    product_angle: 'Product A',
    target_customer: 'Customer A',
    differentiation: 'Diff A',
    created_at: OLD_SIGNAL_DATE,
    user_id: 'user-1',
    quick_economics_check: {
      min_capital_required: 6000,
      launch_complexity: 'medium',
      margin_viable: true,
      complexity_drivers: [],
    },
  },
  'thesis-B': {
    id: 'thesis-B',
    market_signal_id: 'signal-B',
    product_angle: 'Product B',
    target_customer: 'Customer B',
    differentiation: 'Diff B',
    created_at: new Date().toISOString(),
    user_id: 'user-1',
    quick_economics_check: {
      min_capital_required: 4000,
      launch_complexity: 'low',
      margin_viable: false,
      complexity_drivers: [],
    },
  },
}

const signals: Record<string, Record<string, unknown> | null> = {
  // thesis-A: full real evidence, real fee data present.
  'signal-A': {
    id: 'signal-A',
    category_id: 'supplements',
    created_at: OLD_SIGNAL_DATE,
    signal_data: evidenceWithRealFees,
  },
  // thesis-B: no evidence at all (e.g. signal row exists but analysis never
  // populated signal_data) — this is the exact case Finding 7 covers.
  'signal-B': {
    id: 'signal-B',
    category_id: 'supplements',
    created_at: new Date().toISOString(),
    signal_data: null,
  },
}

function makeQueryBuilder(resolve: (eqs: Record<string, string>) => { data: unknown; error: unknown }) {
  const eqs: Record<string, string> = {}
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: string) => { eqs[col] = val; return builder },
    order: () => builder,
    limit: () => builder,
    single: async () => resolve(eqs),
    maybeSingle: async () => resolve(eqs),
  }
  return builder
}

function makeSupabaseServiceMock() {
  return {
    from: (table: string) => {
      if (table === 'founder_profiles') {
        return makeQueryBuilder(() => ({ data: null, error: null })) // no founder profile
      }
      if (table === 'investment_theses') {
        return makeQueryBuilder(eqs => ({ data: theses[eqs.id] ?? null, error: null }))
      }
      if (table === 'market_signals') {
        return makeQueryBuilder(eqs => ({ data: signals[eqs.id] ?? null, error: null }))
      }
      if (table === 'adversarial_debates') {
        return makeQueryBuilder(() => ({ data: null, error: null })) // no debate yet -> stage2
      }
      if (table === 'investment_memos') {
        return makeQueryBuilder(() => ({ data: null, error: null })) // no memo yet -> no verdict
      }
      return makeQueryBuilder(() => ({ data: null, error: null }))
    },
  }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => makeSupabaseServiceMock(),
}))

describe('GET /api/research/compare', () => {
  it('Finding 7: returns opportunity_score null (not a fabricated 0) when evidence is missing', async () => {
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/research/compare?ids=thesis-A,thesis-B')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    const itemA = body.items.find((i: { thesis_id: string }) => i.thesis_id === 'thesis-A')
    const itemB = body.items.find((i: { thesis_id: string }) => i.thesis_id === 'thesis-B')

    expect(itemB.opportunity_score).toBeNull()
    expect(typeof itemA.opportunity_score).toBe('number')
  })

  it('Finding 3: reports fee_data_source real vs. null based on whether evidence/fee data exists', async () => {
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/research/compare?ids=thesis-A,thesis-B')
    const res = await GET(req)
    const body = await res.json()

    const itemA = body.items.find((i: { thesis_id: string }) => i.thesis_id === 'thesis-A')
    const itemB = body.items.find((i: { thesis_id: string }) => i.thesis_id === 'thesis-B')

    expect(itemA.fee_data_source).toBe('real')
    expect(itemB.fee_data_source).toBeNull() // no evidence -> unit economics never computed
  })

  it('Finding 4/5: passes through real signal_created_at and data_confidence', async () => {
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/research/compare?ids=thesis-A,thesis-B')
    const res = await GET(req)
    const body = await res.json()

    const itemA = body.items.find((i: { thesis_id: string }) => i.thesis_id === 'thesis-A')
    expect(itemA.signal_created_at).toBe(OLD_SIGNAL_DATE)
    expect(itemA.data_confidence).toBe(0.82)
  })
})
