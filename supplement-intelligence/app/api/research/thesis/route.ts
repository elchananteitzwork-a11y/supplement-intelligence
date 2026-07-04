import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { generateTheses } from '@/lib/stage2/thesis-generator'
import { assessLaunchThresholds } from '@/lib/stage25/launch-threshold'
import { CompetitiveReviewEngine } from '@/lib/competitive-review-engine/engine'
import { cacheGet, cacheSet } from '@/lib/provider-cache'
import type { Stage1Evidence } from '@/lib/evidence/adapter'
import type { MarketReport } from '@/lib/competitive-review-engine/types'

export const maxDuration = 250

const REVIEW_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days — reviews change slowly

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

// POST /api/research/thesis
// Body: { signal_id: string }
// Requires Stage 1 to have completed and quality_grade !== 'insufficient'
export async function POST(req: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseAuthClient().auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const signalId: string = body?.signal_id ?? ''
    if (!signalId) return NextResponse.json({ error: 'signal_id required' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch Stage 1 market signal
    const { data: signal, error: signalError } = await supabase
      .from('market_signals')
      .select('id, query, quality_grade, pipeline_blocked, signal_data')
      .eq('id', signalId)
      .eq('user_id', user.id)
      .single()

    if (signalError || !signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
    }

    if (signal.pipeline_blocked || signal.quality_grade === 'insufficient') {
      return NextResponse.json(
        { error: 'Stage 1 data quality insufficient — pipeline blocked before thesis generation' },
        { status: 422 }
      )
    }

    // Check for existing theses (idempotent — return existing rather than re-running)
    const { data: existing } = await supabase
      .from('investment_theses')
      .select('*')
      .eq('market_signal_id', signalId)
      .eq('user_id', user.id)
      .order('thesis_index')

    if (existing?.length) {
      return NextResponse.json({
        theses: existing,
        from_cache: true,
        launch_thresholds: assessLaunchThresholds(signal.signal_data as Stage1Evidence),
      })
    }

    // Run launch threshold check (deterministic, before AI call)
    const thresholds = assessLaunchThresholds(signal.signal_data as Stage1Evidence)

    // Competitive review intelligence — collect and analyze competitor reviews,
    // then inject the MarketReport into the thesis prompt as grounded evidence.
    // Non-fatal: if review collection fails, thesis generation proceeds without it.
    let marketReport: MarketReport | undefined
    const competitorList = (signal.signal_data as Stage1Evidence).top_competitors?.value
    const competitorAsins = (competitorList ?? [])
      .map(c => c.productId)
      .filter((id): id is string => !!id)
      .slice(0, 8)

    if (competitorAsins.length >= 3) {
      const reviewCacheKey = `reviews:competitive:v1:${[...competitorAsins].sort().join(',')}`
      const cachedReport = await cacheGet<MarketReport>(reviewCacheKey)
      if (cachedReport) {
        console.log('[thesis] review cache HIT', { asins: competitorAsins.length })
        marketReport = cachedReport
      } else {
        try {
          console.log('[thesis] running competitive review engine', { asins: competitorAsins.length })
          const engine = new CompetitiveReviewEngine()
          marketReport = await engine.analyzeByASINs(competitorAsins, {
            max_products:        competitorAsins.length,
            reviews_per_product: 50,
            product_concurrency: 3,
          })
          cacheSet(reviewCacheKey, 'competitive-review-engine', marketReport, REVIEW_CACHE_TTL_MS).catch(() => {})
          console.log('[thesis] review analysis complete', {
            products:   marketReport.products_analyzed,
            reviews:    marketReport.total_reviews_analyzed,
            confidence: Math.round(marketReport.market_confidence * 100) + '%',
            gaps:       marketReport.universal_gaps.length + marketReport.common_gaps.length,
          })
        } catch (reviewErr) {
          console.error('[thesis] review engine failed (non-fatal)', reviewErr instanceof Error ? reviewErr.message : reviewErr)
        }
      }
    } else {
      console.log('[thesis] skipping review engine — insufficient competitor ASINs', { count: competitorAsins.length })
    }

    // Generate theses via Claude (with review intelligence when available)
    const result = await generateTheses(signal.query, signal.signal_data as Stage1Evidence, marketReport)

    // Persist each thesis
    const rows = result.theses.map(t => ({
      market_signal_id:      signalId,
      user_id:               user.id,
      thesis_index:          t.thesis_index,
      product_angle:         t.product_angle,
      target_customer:       t.target_customer,
      differentiation:       t.differentiation,
      differentiation_source: t.differentiation_source,
      customer_pain:         t.customer_pain,
      supporting_evidence:   t.supporting_evidence,
      quick_economics_check: t.quick_economics_check,
      ai_model_version:      result.ai_model_version,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('investment_theses')
      .insert(rows)
      .select('*')

    if (insertError) {
      console.error('investment_theses insert error', insertError)
      return NextResponse.json({ error: 'Failed to save theses' }, { status: 500 })
    }

    return NextResponse.json({
      theses:             inserted,
      generation_note:    result.generation_note,
      launch_thresholds:  thresholds,
      ai_model_version:   result.ai_model_version,
      from_cache:         false,
    })
  } catch (err) {
    console.error('thesis POST error', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/research/thesis?signal_id=xxx — fetch existing theses + launch thresholds
export async function GET(req: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseAuthClient().auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const signalId = req.nextUrl.searchParams.get('signal_id')
    if (!signalId) return NextResponse.json({ error: 'signal_id required' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const [{ data, error }, { data: signal }] = await Promise.all([
      supabase
        .from('investment_theses')
        .select('*')
        .eq('market_signal_id', signalId)
        .eq('user_id', user.id)
        .order('thesis_index'),
      supabase
        .from('market_signals')
        .select('signal_data')
        .eq('id', signalId)
        .eq('user_id', user.id)
        .single(),
    ])

    if (error) return NextResponse.json({ error: 'Failed to fetch theses' }, { status: 500 })

    const launch_thresholds = signal
      ? assessLaunchThresholds(signal.signal_data as Stage1Evidence)
      : null

    return NextResponse.json({ theses: data ?? [], launch_thresholds })
  } catch (err) {
    console.error('thesis GET error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
