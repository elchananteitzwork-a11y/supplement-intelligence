import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
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

// POST /api/research/founder-profile — upsert a founder profile
export async function POST(req: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseAuthClient().auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: Partial<FounderProfile> = await req.json()

    // Validate required fields
    const required = [
      'capital_available', 'capital_confidence', 'manufacturing_experience',
      'regulatory_experience', 'channel_type', 'target_geography',
      'time_horizon', 'risk_posture', 'long_term_goal',
    ]
    for (const field of required) {
      if (body[field as keyof FounderProfile] == null) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 })
      }
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Upsert: one profile per user (delete + insert for clean update)
    await supabase.from('founder_profiles').delete().eq('user_id', user.id)

    const { data, error } = await supabase
      .from('founder_profiles')
      .insert({
        user_id:                  user.id,
        capital_available:        body.capital_available,
        capital_confidence:       body.capital_confidence,
        manufacturing_experience: body.manufacturing_experience,
        regulatory_experience:    body.regulatory_experience,
        channel_type:             body.channel_type,
        channel_size:             body.channel_size ?? null,
        target_geography:         body.target_geography,
        time_horizon:             body.time_horizon,
        risk_posture:             body.risk_posture,
        long_term_goal:           body.long_term_goal,
      })
      .select('*')
      .single()

    if (error) {
      console.error('founder_profiles insert error', error)
      return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('founder-profile POST error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/research/founder-profile — fetch current user's profile
export async function GET() {
  try {
    const { data: { user }, error: authError } = await supabaseAuthClient().auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from('founder_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('founder_profiles select error', error)
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
    }

    return NextResponse.json(data ?? null)
  } catch (err) {
    console.error('founder-profile GET error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
