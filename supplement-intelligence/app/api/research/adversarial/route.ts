import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { runAdversarialDebate } from '@/lib/stage3/adversarial'
import type { InvestmentThesis } from '@/lib/stage2/types'
import type { Stage1Evidence } from '@/lib/evidence/adapter'

export const maxDuration = 180

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

// POST /api/research/adversarial
// Body: { thesis_id: string }
// Runs 3-call adversarial architecture + kill switches against one thesis.
export async function POST(req: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseAuthClient().auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const thesisId: string = body?.thesis_id ?? ''
    if (!thesisId) return NextResponse.json({ error: 'thesis_id required' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch the thesis
    const { data: thesis, error: thesisError } = await supabase
      .from('investment_theses')
      .select('*')
      .eq('id', thesisId)
      .eq('user_id', user.id)
      .single()

    if (thesisError || !thesis) {
      return NextResponse.json({ error: 'Thesis not found' }, { status: 404 })
    }

    // Fetch the linked Stage 1 signal data
    const { data: signal, error: signalError } = await supabase
      .from('market_signals')
      .select('signal_data')
      .eq('id', thesis.market_signal_id)
      .eq('user_id', user.id)
      .single()

    if (signalError || !signal) {
      return NextResponse.json({ error: 'Market signal not found' }, { status: 404 })
    }

    // Check for existing debate (idempotent)
    const { data: existing } = await supabase
      .from('adversarial_debates')
      .select('*')
      .eq('thesis_id', thesisId)
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ debate: existing, from_cache: true })
    }

    // Run the 3-call adversarial engine
    const result = await runAdversarialDebate(
      thesis as unknown as InvestmentThesis,
      signal.signal_data as Stage1Evidence
    )

    // Persist
    const { data: inserted, error: insertError } = await supabase
      .from('adversarial_debates')
      .insert({
        thesis_id:          thesisId,
        user_id:            user.id,
        bull_case:          result.bull_case,
        bear_case:          result.bear_case,
        conflicts:          result.conflicts,
        unknowns:           result.unknowns,
        kill_switches:      result.kill_switches.results,
        all_switches_clear: result.kill_switches.all_switches_clear,
        ai_model_version:   result.ai_model_version,
      })
      .select('*')
      .single()

    if (insertError) {
      console.error('adversarial_debates insert error', insertError)
      return NextResponse.json({ error: 'Failed to save debate' }, { status: 500 })
    }

    return NextResponse.json({
      debate:       inserted,
      kill_switches: result.kill_switches,
      from_cache:   false,
    })
  } catch (err) {
    console.error('adversarial POST error', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/research/adversarial?thesis_id=xxx
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
      .from('adversarial_debates')
      .select('*')
      .eq('thesis_id', thesisId)
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (error) return NextResponse.json({ error: 'Failed to fetch debate' }, { status: 500 })
    return NextResponse.json(data ?? null)
  } catch (err) {
    console.error('adversarial GET error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
