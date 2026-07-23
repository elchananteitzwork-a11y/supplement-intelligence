import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { addWatch, listWatches, listAlerts } from '@/lib/watchlist/store'
import { enrichWatch } from '@/lib/watchlist/enrich'
// Live-QA fix (2026-07-24): was `@/lib/categories/registry` — the bare
// registry, whose module registration only happens as a side-effect of
// importing the barrel (lib/categories/index.ts). In any process/bundle
// where nothing had loaded the barrel first, getDefault() threw
// "Default category (supplements) not registered" — the long-standing
// "+ Watch" 500 first hit in production on 2026-07-21 and reproduced
// live during V4 Phase 1 QA via the same import in /api/positions.
import { categoryRegistry } from '@/lib/categories'
import type { MemoData } from '@/types/index'

// ── Watchlist API — Roadmap M2.8, enriched for Phase 3 UI integration ───────
// GET  /api/watchlist        → the caller's own active watches, each
//      enriched with real lifecycle/verdict/quality/gap-velocity/
//      confidence/triggered-kill-criteria data (lib/watchlist/enrich.ts —
//      same real functions the Investor Report and Dashboard already use,
//      never a second calculation), plus the caller's own recent analyses
//      that aren't already watched (for the Watchlist page's "add" flow —
//      reuses the same `analyses` table Dashboard already reads).
// POST /api/watchlist        → one-click Watch for an analysis the caller
//      owns. Snapshots the real lifecycle stage + kill criteria that
//      analysis already computed at generation time (lib/kill-criteria.ts,
//      app/api/generate/route.ts) — never re-derived here. category_id
//      defaults to this codebase's own existing "unknown category"
//      convention (categoryRegistry.getDefault(), already used the same
//      way elsewhere, e.g. app/api/research/history/route.ts) when the
//      caller doesn't supply one — real historical analyses never had
//      this field persisted, so there is nothing more specific to read.
//
// Same ownership-check-before-any-read-or-write pattern as
// app/api/outcomes/route.ts (analyses.user_id is checked explicitly, RLS is
// a second, independent layer, not the only one).

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

export async function GET() {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)

  const watches = await listWatches(sb, user.id)
  const alerts  = await listAlerts(sb, user.id, 200)

  // Real memo_data for each watched analysis, in one batched query — never
  // one round-trip per row.
  const analysisIds = watches.map(w => w.analysis_id)
  const memoById = new Map<string, MemoData>()
  if (analysisIds.length) {
    const { data: rows } = await sb
      .from('analyses')
      .select('id, memo_data')
      .in('id', analysisIds)
    for (const row of (rows ?? []) as { id: string; memo_data: MemoData }[]) {
      memoById.set(row.id, row.memo_data)
    }
  }

  const enrichedWatches = watches.map(w => enrichWatch(
    w,
    memoById.get(w.analysis_id) ?? null,
    alerts.filter(a => a.watchlist_id === w.id),
  ))

  // Real, recent analyses the caller owns that aren't already watched —
  // the Watchlist page's "add" flow picks from this list rather than
  // requiring a raw analysis id. Same query shape Dashboard already uses.
  const watchedAnalysisIds = new Set(watches.map(w => w.analysis_id))
  const { data: recentAnalyses } = await sb
    .from('analyses')
    .select('id, category_name, created_at, opportunity_score')
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(30)
  const eligibleAnalyses = ((recentAnalyses ?? []) as { id: string; category_name: string; created_at: string; opportunity_score: number }[])
    .filter(a => !watchedAnalysisIds.has(a.id))

  return NextResponse.json({ watches: enrichedWatches, eligibleAnalyses })
}

export async function POST(req: Request) {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)

  let body: { analysis_id?: string; category_id?: string }
  try { body = await req.json() } catch { return err('Invalid JSON body') }

  const { analysis_id } = body
  if (!analysis_id) return err('analysis_id is required')
  // Real historical analyses never had category_id persisted (a
  // pre-existing gap, not introduced here) — default to this codebase's
  // own established "unknown category" convention rather than requiring
  // every caller to supply one.
  const category_id = body.category_id || categoryRegistry.getDefault().id

  const { data: analysis, error } = await sb
    .from('analyses')
    .select('id, category_name, memo_data')
    .eq('id', analysis_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !analysis) return err('Not found', 404)

  const memo = analysis.memo_data as MemoData
  const watch = await addWatch(sb, user.id, {
    analysisId:  analysis_id,
    categoryName: analysis.category_name,
    categoryId:   category_id,
    lifecycleStageAtWatch: memo.lifecycle_classification?.stage ?? null,
    killCriteria: memo.kill_criteria ?? [],
  })

  if (!watch) return err('Failed to add to watchlist', 500)
  return NextResponse.json({ watch })
}
