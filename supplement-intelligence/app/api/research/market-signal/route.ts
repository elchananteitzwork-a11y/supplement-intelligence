import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signalEngine } from '@/lib/signal-engine/registry'
import { adaptAggregatedSignals } from '@/lib/evidence/adapter'
import { assessDataQuality } from '@/lib/quality-gate/gate'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { keywordEngine } from '@/lib/keyword-engine'
import { toEvidencePoint } from '@/lib/evidence/types'
import { computeRankingDifficulty } from '@/lib/stage1/ranking-difficulty'
import { computePpcEconomics } from '@/lib/stage1/ppc-economics'
import { fetchRegulatoryIntelligence } from '@/lib/regulatory-engine'
import { checkRateLimit, RESEARCH_LIMIT } from '@/lib/rate-limit'

export const maxDuration = 120

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

function sanitizeQuery(q: string): string {
  return q
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/(-{3,}|={3,}|#{3,})/g, '')
    .replace(/\b(SYSTEM|INSTRUCTION|OVERRIDE|IGNORE PREVIOUS)\b/gi, '')
    .trim()
    .slice(0, 200)
}

export async function POST(req: NextRequest) {
  try {
    const sbAuth = supabaseAuthClient()
    const { data: { user }, error: authError } = await sbAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!checkRateLimit(user.id, RESEARCH_LIMIT)) {
      return NextResponse.json({ error: 'Too many requests — please wait a moment' }, { status: 429 })
    }

    const body = await req.json()
    const query: string = sanitizeQuery((body?.query ?? '').trim())
    // Default to 'supplements' — this platform is supplement-focused.
    // Callers may override via category_id to trigger other Keepa nodes.
    const categoryId: string = body?.category_id ?? 'supplements'

    if (!query || query.length < 2) {
      return NextResponse.json({ error: 'query is required (min 2 chars)' }, { status: 400 })
    }
    if (query.length > 200) {
      return NextResponse.json({ error: 'query too long (max 200 chars)' }, { status: 400 })
    }

    const startMs = Date.now()

    // Run signal engine, keyword engine, and regulatory engine in parallel.
    // Keyword engine (DataForSEO) has a 20s budget; regulatory engine (OpenFDA)
    // has an 8s internal timeout — both well within the 100s signal window.
    const [signals, keywordIntelligence, regulatoryIntelligence] = await Promise.all([
      signalEngine.fetch({ query, categoryId }, 100_000),
      keywordEngine.fetch(query, 20_000).catch((err: unknown) => {
        console.warn('keyword engine failed (non-fatal)', err instanceof Error ? err.message : err)
        return null
      }),
      fetchRegulatoryIntelligence(query).catch((err: unknown) => {
        console.warn('regulatory engine failed (non-fatal)', err instanceof Error ? err.message : err)
        return null
      }),
    ])

    if (!signals) {
      return NextResponse.json(
        { error: 'Signal engine returned no data — providers may be unavailable' },
        { status: 503 }
      )
    }

    const fetchedAt = new Date().toISOString()

    const evidence = adaptAggregatedSignals(signals, fetchedAt)

    // Populate monthly_search_volume from DataForSEO when available.
    // Use the highest-volume keyword across all buying/opportunity buckets —
    // this is the best proxy for total addressable search demand in the category.
    if (keywordIntelligence) {
      const allMetrics = [
        ...keywordIntelligence.top_buying,
        ...keywordIntelligence.opportunity,
        ...keywordIntelligence.long_tail,
        ...keywordIntelligence.fast_growing,
      ]
      const topVolume = allMetrics.reduce<number | null>((max, m) =>
        m.monthly_searches > (max ?? 0) ? m.monthly_searches : max, null)

      if (topVolume !== null && topVolume > 0) {
        const topKeyword = allMetrics.find(m => m.monthly_searches === topVolume)
        evidence.monthly_search_volume = toEvidencePoint(
          topVolume,
          'dataforseo',
          'primary_measurement',
          {
            freshness_date: fetchedAt.slice(0, 10),
            scope_note:     `US Google monthly searches for "${topKeyword?.keyword ?? query}" — highest-volume keyword in category`,
            sample_size:    allMetrics.length,
          }
        )
      }
    }

    // Ranking difficulty — deterministic from top_competitors review counts
    const competitorData = evidence.top_competitors?.value
    if (competitorData?.length) {
      const rd = computeRankingDifficulty(competitorData)
      if (rd) {
        evidence.ranking_difficulty = toEvidencePoint(rd, 'apify-amazon-search', 'computed', {
          freshness_date: fetchedAt.slice(0, 10),
          methodology:    'Deterministic from Apify top_competitors review counts',
          scope_note:     rd.sample_note,
          sample_size:    rd.competitor_count,
        })
      }
    }

    // PPC economics — derived from DataForSEO Google CPC + market price evidence
    const ppcEcon = computePpcEconomics(
      keywordIntelligence,
      evidence.median_price?.value ?? 0,
      evidence.avg_fba_fee?.value ?? 4.50,
      evidence.avg_referral_fee_pct?.value ?? 15,
    )
    if (ppcEcon) {
      evidence.ppc_economics = toEvidencePoint(ppcEcon, 'dataforseo+computed', 'computed', {
        freshness_date: fetchedAt.slice(0, 10),
        methodology:    'Google CPC (DataForSEO) + market price → derived Amazon PPC estimate',
        scope_note:     'CPC is Google Ads data, NOT Amazon Ads. Amazon PPC is an estimate.',
      })
    }

    // Regulatory intelligence — OpenFDA FAERS + enforcement (non-fatal, cached 24h)
    if (regulatoryIntelligence) {
      evidence.regulatory_intelligence = toEvidencePoint(
        regulatoryIntelligence,
        'openfda',
        'primary_measurement',
        {
          freshness_date: fetchedAt.slice(0, 10),
          scope_note:     'FDA FAERS adverse event database + enforcement/recall database',
        }
      )
    }

    const totalReviews =
      (signals.review_velocity?.value?.meaningful_competitor_count ?? 0) *
      (signals.review_velocity?.value?.avg_review_count ?? 0)

    const quality = assessDataQuality(evidence, totalReviews)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const dbWrite = supabase
      .from('market_signals')
      .insert({
        user_id:          user.id,
        query,
        category_id:      categoryId,
        quality_grade:    quality.overall,
        quality_detail:   quality,
        pipeline_blocked: quality.pipeline_blocked,
        blocked_reason:   quality.blocked_reason ?? null,
        signal_data:      evidence,
        provider_metadata: {
          providers_used:     signals.providers_used,
          failed_providers:   signals.failed_providers ?? [],
          overall_confidence: signals.overall_confidence,
          keyword_intelligence: keywordIntelligence ?? null,
          duration_ms:        Date.now() - startMs,
          fetched_at:         fetchedAt,
        },
      })
      .select('id, query, quality_grade, pipeline_blocked, blocked_reason, created_at')
      .single()

    const dbTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Supabase write timed out after 12s')), 12_000)
    )

    const { data: row, error: insertError } = await Promise.race([dbWrite, dbTimeout])

    if (insertError) {
      console.error('market_signals insert failed', insertError)
      return NextResponse.json({ error: 'Failed to save signal data' }, { status: 500 })
    }

    return NextResponse.json({
      signal_id:        row.id,
      query:            row.query,
      quality_grade:    row.quality_grade,
      pipeline_blocked: row.pipeline_blocked,
      blocked_reason:   row.blocked_reason,
      created_at:       row.created_at,
      summary: {
        demand_signals_confirmed:  quality.demand_signals_confirmed,
        competitor_products_found: quality.competitor_products_found,
        dimensions:                quality.dimensions,
        providers_used:            signals.providers_used,
        failed_providers:          signals.failed_providers ?? [],
        overall_confidence:        signals.overall_confidence,
        duration_ms:               Date.now() - startMs,
      },
    })
  } catch (err) {
    console.error('market-signal POST error', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const sbGet = supabaseAuthClient()
    const { data: { user }, error: authError } = await sbGet.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = req.nextUrl.searchParams.get('id')

    // No id → return list of recent signals for the user
    if (!id) {
      const { data, error } = await sbGet
        .from('market_signals')
        .select('id, query, quality_grade, pipeline_blocked, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) return NextResponse.json({ error: 'Failed to list signals' }, { status: 500 })
      return NextResponse.json(data ?? [])
    }

    const { data, error } = await sbGet
      .from('market_signals')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('market-signal GET error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
