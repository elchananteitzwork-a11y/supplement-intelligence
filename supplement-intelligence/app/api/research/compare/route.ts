import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { assessLaunchThresholds } from '@/lib/stage25/launch-threshold'
import { computeFullUnitEconomics } from '@/lib/stage4/unit-economics'
import { scoreFit } from '@/lib/stage25/fit-layer'
import type { Stage1Evidence } from '@/lib/evidence/adapter'
import type { InvestmentThesis } from '@/lib/stage2/types'
import type { FounderProfile } from '@/lib/stage25/fit-layer'

export const maxDuration = 30

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ComparisonItem {
  thesis_id:            string
  signal_id:            string
  product_angle:        string
  target_customer:      string
  differentiation:      string
  category_id:          string
  signal_created_at:    string
  stage:                'stage2' | 'stage3' | 'stage4'
  // Stage 1 evidence
  market_revenue_mo:    number | null
  competitor_count:     number | null
  review_concentration: number | null
  median_price:         number | null
  momentum_90d_pct:     number | null
  trend_direction:      string | null
  tiktok_view_count:    number | null
  data_confidence:      number | null
  // Stage 2 economics
  min_capital_required: number
  launch_complexity:    'low' | 'medium' | 'high'
  margin_viable:        boolean
  complexity_drivers:   string[]
  // Stage 2.5 thresholds
  threshold_pass_count: number
  threshold_overall:    string
  // Stage 3 kill switches
  all_switches_clear:   boolean | null
  triggered_switches:   string[]
  // Stage 4 verdict
  verdict_code:         string | null
  verdict_headline:     string | null
  founder_verdict_code: string | null
  // Unit economics (computed)
  breakeven_cogs:       number | null
  base_price:           number | null
  year1_base:           number | null
  base_monthly:         number | null
  // Founder fit (if profile)
  fit_rank:             number | null
  capital_fit_level:    string | null
  channel_fit_level:    string | null
  timeline_fit_level:   string | null
  // Derived composite score
  opportunity_score:    number
}

function supabaseAuthClient() {
  const jar = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items: { name: string; value: string; options: Record<string, unknown> }[]) =>
          items.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    }
  )
}

function computeScore(evidence: Stage1Evidence, verdictCode: string | null): number {
  const thresholds = assessLaunchThresholds(evidence)
  const base = thresholds.pass_count * 14  // 0..70
  if (!verdictCode) return base
  switch (verdictCode) {
    case 'PURSUE':               return Math.min(100, base + 30)
    case 'PURSUE_WITH_CAUTION':  return Math.min(100, base + 15)
    case 'INVESTIGATE_FURTHER':  return base
    case 'DO_NOT_PURSUE':        return Math.max(0, base - 20)
    default:                     return base
  }
}

// GET /api/research/compare?ids=id1,id2,id3
export async function GET(req: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseAuthClient().auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rawIds = req.nextUrl.searchParams.get('ids') ?? ''
    const thesisIds = rawIds.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4)
    if (thesisIds.length < 2) {
      return NextResponse.json({ error: 'At least 2 thesis ids required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Founder profile — one per user, fetched once
    const { data: profile } = await supabase
      .from('founder_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Fetch all theses in parallel
    const thesisResults = await Promise.all(
      thesisIds.map(id =>
        supabase.from('investment_theses').select('*').eq('id', id).eq('user_id', user.id).single()
      )
    )

    // Gather unique signal IDs, then fetch all signals in parallel
    const theses = thesisResults.map(r => r.data).filter(Boolean)
    const signalIds = Array.from(new Set(theses.map(t => t!.market_signal_id)))
    const [signalResults, debateResults, memoResults] = await Promise.all([
      Promise.all(signalIds.map(id =>
        supabase.from('market_signals').select('*').eq('id', id).eq('user_id', user.id).single()
      )),
      Promise.all(thesisIds.map(id =>
        supabase.from('adversarial_debates').select('id, all_switches_clear, kill_switches')
          .eq('thesis_id', id).eq('user_id', user.id).limit(1).maybeSingle()
      )),
      Promise.all(thesisIds.map(id =>
        supabase.from('investment_memos').select('market_verdict, founder_verdict')
          .eq('thesis_id', id).eq('user_id', user.id).limit(1).maybeSingle()
      )),
    ])

    const signalMap = Object.fromEntries(
      signalResults.map(r => [r.data?.id, r.data]).filter(([k]) => k)
    )

    const items: ComparisonItem[] = thesisIds.map((thesisId, idx) => {
      const thesis    = theses[idx]
      if (!thesis) return null

      const signal    = signalMap[thesis.market_signal_id]
      const debate    = debateResults[idx]?.data
      const memo      = memoResults[idx]?.data
      const evidence  = signal?.signal_data as Stage1Evidence | undefined

      const qec = thesis.quick_economics_check as InvestmentThesis['quick_economics_check']

      // Stage 1 metrics
      const market_revenue_mo    = evidence?.est_monthly_revenue?.value ?? null
      const competitor_count     = evidence?.competitor_count?.value ?? null
      const review_concentration = evidence?.review_concentration?.value ?? null
      const median_price         = evidence?.median_price?.value ?? null
      const momentum_90d_pct     = evidence?.momentum_90d_pct?.value ?? null
      const trend_direction      = evidence?.trend_direction?.value ?? null
      const tiktok_view_count    = evidence?.tiktok_view_count?.value ?? null
      const data_confidence      = evidence?.overall_confidence?.value ?? null

      // Thresholds
      const thresholds = evidence
        ? assessLaunchThresholds(evidence)
        : { pass_count: 0, overall: 'fail' as const, checks: [], warn_count: 0, fail_count: 0 }

      // Kill switches
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ksResults: any[] = debate?.kill_switches ?? []
      const triggered = ksResults.filter((r: { triggered?: boolean }) => r.triggered).map((r: { id?: string }) => r.id ?? '')

      // Unit economics
      let breakeven_cogs: number | null = null
      let base_price:     number | null = null
      let year1_base:     number | null = null
      let base_monthly:   number | null = null
      if (evidence) {
        const econ = computeFullUnitEconomics(
          evidence,
          thesis as unknown as InvestmentThesis,
          profile as FounderProfile ?? undefined
        )
        breakeven_cogs = econ.sensitivity.base_case.breakeven_cogs
        base_price     = econ.sensitivity.base_case.price
        year1_base     = econ.revenue_envelope.year1_base
        base_monthly   = econ.revenue_envelope.base_monthly
      }

      // Founder fit
      let fit_rank: number | null = null
      let capital_fit_level: string | null = null
      let channel_fit_level: string | null = null
      let timeline_fit_level: string | null = null
      if (profile) {
        const fit = scoreFit(
          profile as FounderProfile,
          thesis as unknown as InvestmentThesis,
          thesisId,
          (profile as FounderProfile & { id: string }).id
        )
        fit_rank           = fit.fit_rank
        capital_fit_level  = fit.capital_fit.level
        channel_fit_level  = fit.channel_fit.level
        timeline_fit_level = fit.timeline_fit.level
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mv = memo?.market_verdict as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fv = memo?.founder_verdict as any
      const verdict_code         = mv?.code ?? null
      const verdict_headline     = mv?.headline ?? null
      const founder_verdict_code = fv?.code ?? null

      const stage: ComparisonItem['stage'] = memo
        ? 'stage4'
        : debate
        ? 'stage3'
        : 'stage2'

      const opportunity_score = evidence ? computeScore(evidence, verdict_code) : 0

      return {
        thesis_id:            thesisId,
        signal_id:            thesis.market_signal_id as string,
        product_angle:        thesis.product_angle as string,
        target_customer:      thesis.target_customer as string,
        differentiation:      thesis.differentiation as string,
        category_id:          (signal?.category_id as string) ?? 'supplements',
        signal_created_at:    (signal?.created_at as string) ?? thesis.created_at as string,
        stage,
        market_revenue_mo,
        competitor_count,
        review_concentration,
        median_price,
        momentum_90d_pct,
        trend_direction,
        tiktok_view_count,
        data_confidence,
        min_capital_required: qec.min_capital_required,
        launch_complexity:    qec.launch_complexity,
        margin_viable:        qec.margin_viable,
        complexity_drivers:   qec.complexity_drivers,
        threshold_pass_count: thresholds.pass_count,
        threshold_overall:    thresholds.overall as string,
        all_switches_clear:   debate ? debate.all_switches_clear : null,
        triggered_switches:   triggered,
        verdict_code,
        verdict_headline,
        founder_verdict_code,
        breakeven_cogs,
        base_price,
        year1_base,
        base_monthly,
        fit_rank,
        capital_fit_level,
        channel_fit_level,
        timeline_fit_level,
        opportunity_score,
      }
    }).filter((x): x is NonNullable<typeof x> => x !== null) as ComparisonItem[]

    return NextResponse.json({ items, has_profile: !!profile })
  } catch (err) {
    console.error('compare GET error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
