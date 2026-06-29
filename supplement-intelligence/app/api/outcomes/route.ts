import { NextResponse }       from 'next/server'
import { cookies }            from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { BuiltStatus, LaunchStatus, OutcomeVerdict } from '@/types/index'

// ── Outcome Tracking API ────────────────────────────────────────────────
// GET  /api/outcomes?analysis_id=...  → the caller's own outcome report for
//      that analysis (or a default "not_started" shape if none exists yet).
// POST /api/outcomes                  → upsert the caller's own outcome
//      report for one analysis they own.
//
// Ownership is checked explicitly against analyses.user_id before any read
// or write — analysis_outcomes.user_id is NOT trusted as the sole boundary,
// since this mirrors a real gap found and flagged in /api/feedback during
// a prior audit (an analysis_id with no check that the caller owns the
// underlying analysis). RLS on analysis_outcomes is a second, independent
// layer (see supabase/migrations/009_outcome_tracking.sql), not the only one.

const BUILT_STATUSES:  BuiltStatus[]    = ['not_started', 'in_progress', 'built', 'abandoned']
const LAUNCH_STATUSES: LaunchStatus[]   = ['not_launched', 'launched', 'discontinued']
const OUTCOME_VERDICTS: OutcomeVerdict[] = ['success', 'failure', 'too_early_to_tell']
const MAX_NOTES = 2000

function supabaseFromCookies() {
  const jar = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => jar.getAll(),
        setAll: (items: { name: string; value: string; options: Record<string, unknown> }[]) =>
          items.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    }
  )
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function assertOwnsAnalysis(sb: ReturnType<typeof supabaseFromCookies>, analysisId: string, userId: string) {
  const { data, error } = await sb
    .from('analyses')
    .select('id')
    .eq('id', analysisId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return false
  return true
}

export async function GET(req: Request) {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)

  const analysisId = new URL(req.url).searchParams.get('analysis_id')
  if (!analysisId) return err('analysis_id is required')

  if (!(await assertOwnsAnalysis(sb, analysisId, user.id))) return err('Not found', 404)

  const { data, error } = await sb
    .from('analysis_outcomes')
    .select('*')
    .eq('analysis_id', analysisId)
    .maybeSingle()

  if (error) return err('Failed to load outcome', 500)

  // No report yet — return the same default shape the DB column defaults
  // would produce, so the client never has to special-case "row absent."
  return NextResponse.json(data ?? {
    analysis_id: analysisId,
    user_id: user.id,
    built_status: 'not_started',
    launch_status: 'not_launched',
    monthly_revenue_usd: null,
    outcome_verdict: null,
    notes: null,
    created_at: null,
    updated_at: null,
  })
}

export async function POST(req: Request) {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)

  let body: {
    analysis_id?:         string
    built_status?:        string
    launch_status?:       string
    monthly_revenue_usd?: number | null
    outcome_verdict?:     string | null
    notes?:               string | null
  }
  try { body = await req.json() } catch { return err('Invalid JSON body') }

  const { analysis_id } = body
  if (!analysis_id) return err('analysis_id is required')
  if (!(await assertOwnsAnalysis(sb, analysis_id, user.id))) return err('Not found', 404)

  const built_status = body.built_status ?? 'not_started'
  if (!BUILT_STATUSES.includes(built_status as BuiltStatus)) return err('Invalid built_status')

  const launch_status = body.launch_status ?? 'not_launched'
  if (!LAUNCH_STATUSES.includes(launch_status as LaunchStatus)) return err('Invalid launch_status')

  let monthly_revenue_usd: number | null = null
  if (body.monthly_revenue_usd !== undefined && body.monthly_revenue_usd !== null) {
    const n = Number(body.monthly_revenue_usd)
    if (!Number.isFinite(n) || n < 0) return err('monthly_revenue_usd must be a non-negative number')
    monthly_revenue_usd = n
  }

  let outcome_verdict: OutcomeVerdict | null = null
  if (body.outcome_verdict) {
    if (!OUTCOME_VERDICTS.includes(body.outcome_verdict as OutcomeVerdict)) return err('Invalid outcome_verdict')
    outcome_verdict = body.outcome_verdict as OutcomeVerdict
  }

  const notes = body.notes?.trim() ? body.notes.trim().slice(0, MAX_NOTES) : null

  const { data, error } = await sb
    .from('analysis_outcomes')
    .upsert({
      analysis_id,
      user_id: user.id,
      built_status,
      launch_status,
      monthly_revenue_usd,
      outcome_verdict,
      notes,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) {
    console.error('Outcome upsert failed', error)
    return err('Failed to save outcome report', 500)
  }

  return NextResponse.json(data)
}
