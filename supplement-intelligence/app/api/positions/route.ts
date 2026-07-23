import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { addWatch } from '@/lib/watchlist/store'
import { categoryRegistry } from '@/lib/categories/registry'
import { isPositionState, type Position, type PositionState } from '@/lib/positions'
import { computeGroundedScore } from '@/lib/scoring'
import type { MemoData } from '@/types/index'

// ── Positions API — V4 Phase 1 (Pull) ────────────────────────────────────────
// docs/RD_V4_PHASE1.md §3 item 4. Owner-scoped position state (validating /
// watching / killed) for an analysis the caller owns — the persisted result
// of the one committed Pull action.
//
// GET  /api/positions  → the caller's own positions, joined with minimal
//      real analysis identity (category_name, build_decision) — same
//      "batch-fetch analyses separately, merge in app code" shape as
//      app/api/watchlist/route.ts's GET, rather than relying on PostgREST
//      embedded-resource syntax.
// POST /api/positions  → upsert one position for an analysis the caller
//      owns. When state = 'watching', also creates the real watchlist entry
//      via lib/watchlist/store.ts's addWatch() — the exact same helper
//      app/api/watchlist/route.ts's own POST calls — rather than
//      duplicating the watchlist mechanism. addWatch() already upserts on
//      (user_id, analysis_id), so this naturally creates-if-absent /
//      updates-if-present without a separate existence check.
//
// Same ownership-check-before-any-write pattern as app/api/outcomes/route.ts
// and app/api/watchlist/route.ts (analyses.user_id is checked explicitly;
// RLS on `positions` — migration 029 — is a second, independent layer, not
// the only one).
//
// The `positions` table (migration 029) is a NEW table pending a manual
// production migration (see supabase/PENDING_MIGRATIONS.sql) — every
// Supabase call here that touches `positions` explicitly detects a
// "table not found" error and returns an honest 503, never a crash and
// never a silent success.

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

// PostgREST's real error shape for a table that doesn't exist yet in the
// live schema cache is code 'PGRST205' (message: "Could not find the table
// '...' in the schema cache"). A direct Postgres 'undefined_table' (42P01)
// is included too in case a call ever reaches Postgres directly.
function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  const msg = error.message ?? ''
  return msg.includes('schema cache') || /relation .* does not exist/.test(msg)
}

const MIGRATION_PENDING_MSG = 'Positions are not yet available on this deployment — a pending database migration must be applied first.'

// Input-size bounds (security-review advisory, 2026-07-24) — same
// house convention as MAX_QUERY_LEN (app/api/thesis/route.ts),
// MAX_INPUT/MAX_AUDIENCE (app/api/generate/route.ts), MAX_BODY_CHARS
// (app/api/reviews/analyze/route.ts): an authenticated user must not be
// able to store unbounded blobs. successMetrics is the real
// deriveSuccessMetrics() string[] snapshot — a handful of short
// sentences — so these bounds are generous for every legitimate payload.
const MAX_KILL_REASON_CHARS     = 500
const MAX_SUCCESS_METRICS_ITEMS = 20
const MAX_SUCCESS_METRIC_CHARS  = 300

// null → valid-and-absent; string[] within bounds → valid; anything else → null
// means "reject" (distinguished by the boolean flag).
function validateSuccessMetrics(v: unknown): { ok: boolean; value: string[] | null } {
  if (v === undefined || v === null) return { ok: true, value: null }
  if (!Array.isArray(v) || v.length > MAX_SUCCESS_METRICS_ITEMS) return { ok: false, value: null }
  if (!v.every(item => typeof item === 'string' && item.length <= MAX_SUCCESS_METRIC_CHARS)) return { ok: false, value: null }
  return { ok: true, value: v as string[] }
}

interface PositionRow {
  analysis_id:     string
  state:            PositionState
  success_metrics:  unknown
  kill_reason:      string | null
  created_at:       string
}

interface AnalysisIdentityRow {
  id:              string
  category_name:   string
  build_decision:  Position['decision']
  memo_data:       MemoData
}

// Fix-and-resubmit cycle (independent review finding 1): analyses.
// build_decision persists computeGroundedScore's internal 'SKIP' artifact
// for an insufficient-evidence analysis (lib/scoring.ts) — never a real
// "Not Supported" judgment. Recomputed here from the row's own real
// memo_data (N is small — a user's own position list) so GET/POST never
// hand the client a decision label it would render as a fabricated
// verdict; the client (components/partner/PositionsStrip.tsx) renders the
// same honest "can't call" wording the Brief already uses when this is true.
function computeInsufficientEvidence(memo: MemoData | null | undefined): boolean {
  if (!memo) return false
  try {
    return computeGroundedScore(memo).insufficientEvidence
  } catch {
    // A malformed/legacy memo_data must never crash this route — degrade to
    // "not flagged insufficient" (the pre-existing behavior), never a 500.
    return false
  }
}

export async function GET() {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)

  const { data: rows, error } = await sb
    .from('positions')
    .select('analysis_id, state, success_metrics, kill_reason, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingTableError(error)) return err(MIGRATION_PENDING_MSG, 503)
    return err('Failed to load positions', 500)
  }

  const positionRows = (rows ?? []) as PositionRow[]
  const analysisIds = positionRows.map(r => r.analysis_id)
  const analysisById = new Map<string, AnalysisIdentityRow>()
  if (analysisIds.length) {
    const { data: analysisRows } = await sb
      .from('analyses')
      .select('id, category_name, build_decision, memo_data')
      .in('id', analysisIds)
    for (const a of (analysisRows ?? []) as AnalysisIdentityRow[]) analysisById.set(a.id, a)
  }

  const positions: Position[] = positionRows.map(r => {
    const a = analysisById.get(r.analysis_id)
    return {
      analysisId:     r.analysis_id,
      state:           r.state,
      successMetrics: (r.success_metrics as Position['successMetrics']) ?? null,
      killReason:      r.kill_reason ?? null,
      createdAt:       r.created_at,
      categoryName:    a?.category_name ?? '',
      decision:        a?.build_decision ?? null,
      insufficientEvidence: computeInsufficientEvidence(a?.memo_data),
    }
  })

  return NextResponse.json({ positions })
}

export async function POST(req: Request) {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)

  let body: { analysisId?: string; state?: string; successMetrics?: unknown; killReason?: string }
  try { body = await req.json() } catch { return err('Invalid JSON body') }

  const { analysisId } = body
  if (!analysisId) return err('analysisId is required')
  if (!isPositionState(body.state)) return err(`state must be one of: ${['validating', 'watching', 'killed'].join(', ')}`)
  const state = body.state

  const metrics = validateSuccessMetrics(body.successMetrics)
  if (!metrics.ok) return err(`successMetrics must be an array of at most ${MAX_SUCCESS_METRICS_ITEMS} strings (each at most ${MAX_SUCCESS_METRIC_CHARS} characters)`)
  if (body.killReason !== undefined && body.killReason !== null && (typeof body.killReason !== 'string' || body.killReason.length > MAX_KILL_REASON_CHARS)) {
    return err(`killReason must be a string of at most ${MAX_KILL_REASON_CHARS} characters`)
  }

  const { data: analysis, error: analysisError } = await sb
    .from('analyses')
    .select('id, category_name, build_decision, memo_data')
    .eq('id', analysisId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (analysisError || !analysis) return err('Not found', 404)

  const row = {
    user_id:         user.id,
    analysis_id:     analysisId,
    state,
    success_metrics: metrics.value,
    kill_reason:     state === 'killed' ? (body.killReason ?? null) : null,
    updated_at:      new Date().toISOString(),
  }

  const { data, error } = await sb
    .from('positions')
    .upsert(row, { onConflict: 'user_id,analysis_id' })
    .select('analysis_id, state, success_metrics, kill_reason, created_at')
    .single()

  if (error) {
    if (isMissingTableError(error)) return err(MIGRATION_PENDING_MSG, 503)
    return err('Failed to save position', 500)
  }

  // 'watching' reuses the real watchlist mechanism (migration 023) rather
  // than duplicating it — same addWatch() helper, same snapshot fields,
  // app/api/watchlist/route.ts's own POST calls. Non-fatal: matching this
  // codebase's established persistence discipline (lib/provider-cache,
  // lib/niche-timeseries), a failure here never blocks the position save
  // that already succeeded above — addWatch() itself logs the failure.
  if (state === 'watching') {
    const memo = analysis.memo_data as MemoData
    await addWatch(sb, user.id, {
      analysisId,
      categoryName: analysis.category_name,
      categoryId:   categoryRegistry.getDefault().id,
      lifecycleStageAtWatch: memo.lifecycle_classification?.stage ?? null,
      killCriteria: memo.kill_criteria ?? [],
    })
  }

  const saved = data as PositionRow
  const position: Position = {
    analysisId:     saved.analysis_id,
    state:           saved.state,
    successMetrics: (saved.success_metrics as Position['successMetrics']) ?? null,
    killReason:      saved.kill_reason ?? null,
    createdAt:       saved.created_at,
    categoryName:    analysis.category_name,
    decision:        analysis.build_decision ?? null,
    insufficientEvidence: computeInsufficientEvidence(analysis.memo_data as MemoData),
  }

  return NextResponse.json({ position })
}
