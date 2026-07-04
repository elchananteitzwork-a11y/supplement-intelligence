import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { assessLaunchThresholds } from '@/lib/stage25/launch-threshold'
import type { Stage1Evidence } from '@/lib/evidence/adapter'

export const maxDuration = 30

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

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Derive a 0–100 opportunity score from Stage 1 thresholds + Stage 4 verdict.
function computeOpportunityScore(evidence: Stage1Evidence, verdictCode: string | null): number {
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

// ── GET /api/research/history ─────────────────────────────────────────────────
// Returns enriched list of all market signals for the current user, including
// derived status, opportunity score, verdicts, and favorites.
export async function GET() {
  try {
    const authClient = supabaseAuthClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = serviceClient()

    // Nested select: signals → theses → debates + memos
    const { data: signals, error } = await supabase
      .from('market_signals')
      .select(`
        id, query, category_id, quality_grade, pipeline_blocked, blocked_reason, created_at, signal_data,
        investment_theses (
          id,
          adversarial_debates ( id, all_switches_clear ),
          investment_memos ( id, market_verdict )
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })

    // User favorites stored in auth metadata
    const favorited: string[] = (user.user_metadata?.favorited_signals as string[] | undefined) ?? []
    const favoritedSet = new Set(favorited)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (signals ?? []).map((s: any) => {
      const theses: unknown[]      = s.investment_theses ?? []
      const thesis_count           = theses.length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allDebates             = theses.flatMap((t: any) => t.adversarial_debates ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allMemos               = theses.flatMap((t: any) => t.investment_memos ?? [])
      const has_debates            = allDebates.length > 0
      const has_memo               = allMemos.length > 0

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const latestMemo             = allMemos[0] as any | undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const market_verdict         = latestMemo?.market_verdict as any | null
      const verdict_code: string | null = market_verdict?.code ?? null

      let status: string
      if (s.pipeline_blocked) {
        status = 'blocked'
      } else if (has_memo) {
        status = 'stage4'
      } else if (has_debates) {
        status = 'stage3'
      } else if (thesis_count > 0) {
        status = 'stage2'
      } else {
        status = 'stage1'
      }

      const evidence = s.signal_data as Stage1Evidence
      const opportunity_score = computeOpportunityScore(evidence, verdict_code)

      return {
        id:                 s.id as string,
        query:              s.query as string,
        category_id:        (s.category_id as string | null) ?? 'supplements',
        quality_grade:      s.quality_grade as string,
        pipeline_blocked:   s.pipeline_blocked as boolean,
        blocked_reason:     s.blocked_reason as string | null,
        created_at:         s.created_at as string,
        status,
        thesis_count,
        has_debates,
        has_memo,
        verdict_code,
        verdict_headline:   (market_verdict?.headline as string | null) ?? null,
        opportunity_score,
        is_favorited:       favoritedSet.has(s.id as string),
      }
    })

    return NextResponse.json({ items, total: items.length })
  } catch (err) {
    console.error('history GET error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE /api/research/history?id=xxx ──────────────────────────────────────
// Deletes a market_signal row. All child rows cascade via ON DELETE CASCADE.
export async function DELETE(req: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseAuthClient().auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const supabase = serviceClient()
    const { error } = await supabase
      .from('market_signals')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('history DELETE error', error)
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('history DELETE error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH /api/research/history ───────────────────────────────────────────────
// Body: { id: string, favorited: boolean }
// Persists favorites in auth user_metadata so they survive across sessions.
export async function PATCH(req: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseAuthClient().auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body        = await req.json()
    const id: string  = body?.id ?? ''
    const favorited: boolean = body?.favorited ?? false
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const current: string[] = (user.user_metadata?.favorited_signals as string[] | undefined) ?? []
    const updated = favorited
      ? Array.from(new Set([...current, id])).slice(-200)
      : current.filter(x => x !== id)

    const supabase = serviceClient()
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { favorited_signals: updated },
    })

    if (error) {
      console.error('history PATCH error', error)
      return NextResponse.json({ error: 'Failed to update favorite' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, favorited_signals: updated })
  } catch (err) {
    console.error('history PATCH error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
