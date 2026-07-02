import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { generateTheses } from '@/lib/stage2/thesis-generator'
import { assessLaunchThresholds } from '@/lib/stage25/launch-threshold'
import type { Stage1Evidence } from '@/lib/evidence/adapter'

export const maxDuration = 90

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

    // Generate theses via Claude
    const result = await generateTheses(signal.query, signal.signal_data as Stage1Evidence)

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
