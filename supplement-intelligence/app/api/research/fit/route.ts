import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { scoreFit } from '@/lib/stage25/fit-layer'
import type { InvestmentThesis } from '@/lib/stage2/types'
import type { FounderProfile } from '@/lib/stage25/fit-layer'

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

// POST /api/research/fit
// Body: { signal_id: string }
// Fetches the user's founder profile and all theses for the signal, then
// scores fit deterministically. Stores results in founder_fit_annotations.
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

    // Fetch founder profile
    const { data: profile, error: profileError } = await supabase
      .from('founder_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Founder profile not found — complete your profile first' }, { status: 422 })
    }

    // Fetch theses for this signal
    const { data: theses, error: thesisError } = await supabase
      .from('investment_theses')
      .select('*')
      .eq('market_signal_id', signalId)
      .eq('user_id', user.id)
      .order('thesis_index')

    if (thesisError || !theses?.length) {
      return NextResponse.json({ error: 'No theses found for this signal — run thesis generation first' }, { status: 422 })
    }

    // Check for existing fit annotations (idempotent)
    const { data: existing } = await supabase
      .from('founder_fit_annotations')
      .select('*')
      .eq('founder_profile_id', profile.id)
      .in('thesis_id', theses.map((t: { id: string }) => t.id))

    if (existing?.length === theses.length) {
      return NextResponse.json({ annotations: existing, from_cache: true })
    }

    // Score fit for each thesis (deterministic — no AI)
    const annotations = theses.map((thesis: InvestmentThesis & { id: string }) =>
      scoreFit(profile as FounderProfile, thesis, thesis.id, profile.id)
    )

    // Sort by fit_rank descending (best fit first)
    annotations.sort((a, b) => b.fit_rank - a.fit_rank)

    // Persist
    const rows = annotations.map(a => ({
      thesis_id:          a.thesis_id,
      founder_profile_id: a.founder_profile_id,
      user_id:            user.id,
      fit_rank:           a.fit_rank,
      capital_fit:        a.capital_fit,
      experience_gaps:    a.experience_gaps,
      channel_fit:        a.channel_fit,
      timeline_fit:       a.timeline_fit,
      advantages:         a.advantages,
      gaps:               a.gaps,
    }))

    // Upsert: delete existing for this profile+thesis combo, then insert
    if (existing?.length) {
      await supabase
        .from('founder_fit_annotations')
        .delete()
        .eq('founder_profile_id', profile.id)
        .in('thesis_id', theses.map((t: { id: string }) => t.id))
    }

    const { data: inserted, error: insertError } = await supabase
      .from('founder_fit_annotations')
      .insert(rows)
      .select('*')

    if (insertError) {
      console.error('founder_fit_annotations insert error', insertError)
      return NextResponse.json({ error: 'Failed to save fit annotations' }, { status: 500 })
    }

    return NextResponse.json({ annotations: inserted, from_cache: false })
  } catch (err) {
    console.error('fit POST error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
