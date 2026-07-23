import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isProductEventName } from '@/lib/positions'

// ── Product Events API — V4 Phase 1 gate instrumentation ────────────────────
// docs/RD_V4_PHASE1.md §3 item 5 / §5 Phase-1 validation gates. POST-only,
// owner-scoped write for the small, closed set of events the Phase-1 gate
// metrics need (verdict_viewed / claim_tapped / pull_committed /
// returned_after_trip). No third-party analytics; nothing else is logged.
//
// The `product_events` table (migration 030) is a NEW table pending a
// manual production migration (see supabase/PENDING_MIGRATIONS.sql) — a
// "table not found" error is detected explicitly and returned as an honest
// 503, never a crash and never a silent success.

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

// See app/api/positions/route.ts for the identical rationale — PostgREST's
// real "table not found" error code is 'PGRST205'; 42P01 covers a direct
// Postgres 'undefined_table' should a call ever bypass PostgREST.
function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  const msg = error.message ?? ''
  return msg.includes('schema cache') || /relation .* does not exist/.test(msg)
}

const MIGRATION_PENDING_MSG = 'Event logging is not yet available on this deployment — a pending database migration must be applied first.'

export async function POST(req: Request) {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)

  let body: { event?: string; analysisId?: string }
  try { body = await req.json() } catch { return err('Invalid JSON body') }

  if (!isProductEventName(body.event)) {
    return err(`event must be one of: verdict_viewed, claim_tapped, pull_committed, returned_after_trip`)
  }

  // Ownership check on the optional analysisId (security-review advisory,
  // 2026-07-24): without it, a caller could tag their own event log with
  // another user's analysis UUID — harmless to that user (RLS keeps reads
  // owner-scoped) but a needless existence oracle and a dirty metric.
  // Same check-before-write pattern as app/api/positions/route.ts.
  if (body.analysisId) {
    const { data: owned } = await sb
      .from('analyses')
      .select('id')
      .eq('id', body.analysisId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!owned) return err('Not found', 404)
  }

  const { error } = await sb
    .from('product_events')
    .insert({
      user_id:     user.id,
      event:        body.event,
      analysis_id: body.analysisId ?? null,
    })

  if (error) {
    if (isMissingTableError(error)) return err(MIGRATION_PENDING_MSG, 503)
    return err('Failed to log event', 500)
  }

  return new NextResponse(null, { status: 204 })
}
