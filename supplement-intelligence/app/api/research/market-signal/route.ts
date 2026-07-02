import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signalEngine } from '@/lib/signal-engine/registry'
import { adaptAggregatedSignals } from '@/lib/evidence/adapter'
import { assessDataQuality } from '@/lib/quality-gate/gate'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

export async function POST(req: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseAuthClient().auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const query: string = (body?.query ?? '').trim()
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

    // Allow up to 100s for providers — Apify's actor needs up to 90s.
    // Route maxDuration is 120s so this fits safely.
    const signals = await signalEngine.fetch({ query, categoryId }, 100_000)

    if (!signals) {
      return NextResponse.json(
        { error: 'Signal engine returned no data — providers may be unavailable' },
        { status: 503 }
      )
    }

    const fetchedAt = new Date().toISOString()

    const evidence = adaptAggregatedSignals(signals, fetchedAt)

    const totalReviews =
      (signals.review_velocity?.value?.meaningful_competitor_count ?? 0) *
      (signals.review_velocity?.value?.avg_review_count ?? 0)

    const quality = assessDataQuality(evidence, totalReviews)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: row, error: insertError } = await supabase
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
          duration_ms:        Date.now() - startMs,
          fetched_at:         fetchedAt,
        },
      })
      .select('id, query, quality_grade, pipeline_blocked, blocked_reason, created_at')
      .single()

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
    const { data: { user }, error: authError } = await supabaseAuthClient().auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const id = req.nextUrl.searchParams.get('id')

    // No id → return list of recent signals for the user
    if (!id) {
      const { data, error } = await supabase
        .from('market_signals')
        .select('id, query, quality_grade, pipeline_blocked, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) return NextResponse.json({ error: 'Failed to list signals' }, { status: 500 })
      return NextResponse.json(data ?? [])
    }

    const { data, error } = await supabase
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
