import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { addWatch, listWatches } from '@/lib/watchlist/store'
import type { MemoData } from '@/types/index'

// ── Watchlist API — Roadmap M2.8 ─────────────────────────────────────────────
// GET  /api/watchlist        → the caller's own active watches.
// POST /api/watchlist        → one-click Watch for an analysis the caller
//      owns. Snapshots the real lifecycle stage + kill criteria that
//      analysis already computed at generation time (lib/kill-criteria.ts,
//      app/api/generate/route.ts) — never re-derived here.
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
  return NextResponse.json({ watches })
}

export async function POST(req: Request) {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)

  let body: { analysis_id?: string; category_id?: string }
  try { body = await req.json() } catch { return err('Invalid JSON body') }

  const { analysis_id, category_id } = body
  if (!analysis_id) return err('analysis_id is required')
  if (!category_id) return err('category_id is required')

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
