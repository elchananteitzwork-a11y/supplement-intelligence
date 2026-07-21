import { NextRequest, NextResponse } from 'next/server'
import { supabaseAuthClient, fetchAnalysisComparisonItems, UUID_RE } from './buildComparisonItems'
export type { AnalysisComparisonItem } from './buildComparisonItems'

export const maxDuration = 30

// GET /api/research/compare?ids=id1,id2,id3 — ids are `analyses` row ids
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAuthClient()
    const { data: { user }, error: authError } = await sb.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rawIds = req.nextUrl.searchParams.get('ids') ?? ''
    const ids = rawIds.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4)
    if (ids.length < 2) {
      return NextResponse.json({ error: 'At least 2 analysis ids required' }, { status: 400 })
    }
    // Pre-beta audit fix: a non-UUID id previously reached `.in('id', ids)`
    // and threw a real Postgres "invalid input syntax for type uuid" error,
    // caught below and reported as a generic 500 — wrong status for a bad
    // request. Reject it as a 400 before the query runs at all.
    if (ids.some(id => !UUID_RE.test(id))) {
      return NextResponse.json({ error: 'Invalid analysis id' }, { status: 400 })
    }

    // RLS-scoped to the authenticated user — same pattern app/memo/[id]/page.tsx
    // and app/pipeline/page.tsx already use (real cookie-auth client, explicit
    // .eq('user_id', ...) as defense in depth, no service-role client needed
    // now that Founder Fit — the one thing that previously needed it — is gone).
    const { items, error: fetchError } = await fetchAnalysisComparisonItems(sb, user.id, ids)
    if (fetchError) {
      return NextResponse.json({ error: fetchError }, { status: 500 })
    }

    if (items.length < 2) {
      return NextResponse.json({ error: 'At least 2 analyses ids required' }, { status: 400 })
    }

    return NextResponse.json({ items })
  } catch (err) {
    console.error('compare GET error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
