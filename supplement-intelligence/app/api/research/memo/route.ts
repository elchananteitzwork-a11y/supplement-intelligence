import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { assessLaunchThresholds } from '@/lib/stage25/launch-threshold'
import { computeFullUnitEconomics } from '@/lib/stage4/unit-economics'
import { determineMarketVerdict, determineFounderVerdict } from '@/lib/stage4/verdict'
import { generateInvestmentMemo } from '@/lib/stage4/memo-generator'
import { reconstructKillSwitchEvaluation } from '@/lib/stage3/kill-switches'
import type { KillSwitchResult } from '@/lib/stage3/kill-switches'
import type { InvestmentThesis, FounderFitAnnotation } from '@/lib/stage2/types'
import type { Stage1Evidence } from '@/lib/evidence/adapter'
import type { AdversarialDebateResult } from '@/lib/stage3/adversarial'
import type { Stage4FounderInputs } from '@/lib/stage4/unit-economics'
import type { FounderProfile } from '@/lib/stage25/fit-layer'

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

// POST /api/research/memo
// Body: { thesis_id: string, founder_inputs?: Stage4FounderInputs }
// Requires: Stage 1 signal, Stage 2 thesis, Stage 3 debate all complete.
export async function POST(req: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseAuthClient().auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const thesisId: string        = body?.thesis_id ?? ''
    const founderInputs: Stage4FounderInputs | undefined = body?.founder_inputs

    if (!thesisId) return NextResponse.json({ error: 'thesis_id required' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch thesis
    const { data: thesis, error: thesisError } = await supabase
      .from('investment_theses')
      .select('*')
      .eq('id', thesisId)
      .eq('user_id', user.id)
      .single()
    if (thesisError || !thesis) return NextResponse.json({ error: 'Thesis not found' }, { status: 404 })

    // Fetch signal, debate, profile in parallel
    const [
      { data: signal, error: signalError },
      { data: debate, error: debateError },
      { data: profile },
      { data: fitAnnotation },
    ] = await Promise.all([
      supabase.from('market_signals').select('*').eq('id', thesis.market_signal_id).eq('user_id', user.id).single(),
      supabase.from('adversarial_debates').select('*').eq('thesis_id', thesisId).eq('user_id', user.id).limit(1).maybeSingle(),
      supabase.from('founder_profiles').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('founder_fit_annotations').select('*').eq('thesis_id', thesisId).eq('user_id', user.id).maybeSingle(),
    ])

    if (signalError || !signal) return NextResponse.json({ error: 'Market signal not found' }, { status: 404 })
    if (debateError || !debate) return NextResponse.json({ error: 'Adversarial debate not found — run Stage 3 first' }, { status: 422 })

    // ── Deterministic computation ────────────────────────────────────────────
    // Computed before the cache check so unit_economics is always available.
    const evidence   = signal.signal_data as Stage1Evidence
    const thesisData = thesis as unknown as InvestmentThesis

    const thresholds  = assessLaunchThresholds(evidence)
    const economics   = computeFullUnitEconomics(
      evidence,
      thesisData,
      profile as FounderProfile ?? undefined,
      founderInputs
    )

    // Check for existing memo (idempotent — same thesis_id returns cached)
    const { data: existing } = await supabase
      .from('investment_memos')
      .select('*')
      .eq('thesis_id', thesisId)
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (existing && !founderInputs) {
      return NextResponse.json({ memo: existing, from_cache: true, unit_economics: economics })
    }

    // Reconstruct kill switch evaluation from stored results
    const storedKSResults = (debate.kill_switches ?? []) as KillSwitchResult[]
    const killSwitches = reconstructKillSwitchEvaluation(storedKSResults)

    const marketVerdict  = determineMarketVerdict(killSwitches, thresholds, economics)
    const founderVerdict = fitAnnotation
      ? determineFounderVerdict(marketVerdict, fitAnnotation as unknown as FounderFitAnnotation)
      : null

    // ── AI call for prose sections ─────────────────────────────────────────
    const memo = await generateInvestmentMemo(
      thesisData,
      evidence,
      debate as unknown as AdversarialDebateResult,
      economics,
      marketVerdict,
      founderVerdict,
      (fitAnnotation ?? undefined) as unknown as FounderFitAnnotation | undefined
    )

    // ── Persist ────────────────────────────────────────────────────────────
    if (existing) {
      await supabase.from('investment_memos').delete().eq('id', existing.id)
    }

    const { data: inserted, error: insertError } = await supabase
      .from('investment_memos')
      .insert({
        thesis_id:             thesisId,
        debate_id:             debate.id,
        founder_profile_id:    profile?.id ?? null,
        user_id:               user.id,
        founder_stage4_inputs: founderInputs ?? {},
        sections:              memo.sections,
        market_verdict:        memo.market_verdict,
        founder_verdict:       memo.founder_verdict,
        verdict_divergence:    memo.founder_verdict?.divergence ?? null,
        freshness_notice:      memo.freshness_notice,
        ai_model_version:      memo.ai_model_version,
      })
      .select('*')
      .single()

    if (insertError) {
      console.error('investment_memos insert error', insertError)
      return NextResponse.json({ error: 'Failed to save memo' }, { status: 500 })
    }

    return NextResponse.json({ memo: inserted, from_cache: false, unit_economics: economics })
  } catch (err) {
    console.error('memo POST error', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/research/memo?thesis_id=xxx
// Returns the stored memo augmented with freshly-computed unit economics.
// Unit economics are deterministic (pure arithmetic from Stage 1 data) so
// recomputing them here guarantees refresh-safe values without a schema migration.
export async function GET(req: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseAuthClient().auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const thesisId = req.nextUrl.searchParams.get('thesis_id')
    if (!thesisId) return NextResponse.json({ error: 'thesis_id required' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from('investment_memos')
      .select('*')
      .eq('thesis_id', thesisId)
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (error) return NextResponse.json({ error: 'Failed to fetch memo' }, { status: 500 })
    if (!data) return NextResponse.json(null)

    // Recompute unit economics from the stored source data
    // (thesis + signal + profile + the saved founder_stage4_inputs)
    const [{ data: thesis }, { data: profile }] = await Promise.all([
      supabase.from('investment_theses').select('*').eq('id', thesisId).eq('user_id', user.id).single(),
      supabase.from('founder_profiles').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    let unit_economics = null
    if (thesis) {
      const { data: signal } = await supabase
        .from('market_signals')
        .select('signal_data')
        .eq('id', thesis.market_signal_id)
        .eq('user_id', user.id)
        .single()

      if (signal) {
        const evidence     = signal.signal_data as Stage1Evidence
        const thesisData   = thesis as unknown as InvestmentThesis
        const savedInputs  = data.founder_stage4_inputs
        const founderInputs: Stage4FounderInputs | undefined =
          savedInputs && typeof savedInputs === 'object' && Object.keys(savedInputs).length
            ? savedInputs as Stage4FounderInputs
            : undefined

        unit_economics = computeFullUnitEconomics(
          evidence,
          thesisData,
          profile as FounderProfile ?? undefined,
          founderInputs
        )
      }
    }

    return NextResponse.json({ ...data, unit_economics })
  } catch (err) {
    console.error('memo GET error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
