import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { listAlerts } from '@/lib/watchlist/store'
import { enrichAlert } from '@/lib/watchlist/alerts-display'
import type { WatchlistEntry } from '@/lib/watchlist/types'
import type { MemoData } from '@/types/index'

// ── Alerts API — Phase 3 UI integration over the existing Roadmap M2.8 ─────
// alert pipeline (migration 023_watchlist.sql, lib/watchlist/recheck.ts).
// Read-only: watchlist_alerts has no insert/update policy for regular users
// (only the re-check cron, via the service role, ever writes a row) — this
// route only ever selects.
//
// Joins each real alert to its own watch (for category_name + the real
// kill-criteria snapshot needed to build an honest detail line) and that
// watch's own current analysis (for real current verdict/confidence via
// enrichAlert -> enrichWatch — never a second calculation). Watches are
// looked up directly by id, not via listWatches()'s active-only filter,
// because watchlist_alerts intentionally outlives an unwatch (soft
// delete — see lib/watchlist/store.ts's removeWatch comment) so a past
// alert must still resolve even after the user removes that watch.

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

export async function GET() {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const alerts = await listAlerts(sb, user.id, 100)

  const watchlistIds = Array.from(new Set(alerts.map(a => a.watchlist_id)))
  const watchById = new Map<string, WatchlistEntry>()
  if (watchlistIds.length) {
    const { data } = await sb
      .from('watchlist')
      .select('*')
      .eq('user_id', user.id)
      .in('id', watchlistIds)
    for (const row of (data ?? []) as WatchlistEntry[]) watchById.set(row.id, row)
  }

  const analysisIds = Array.from(new Set(Array.from(watchById.values()).map(w => w.analysis_id)))
  const memoById = new Map<string, MemoData>()
  if (analysisIds.length) {
    const { data } = await sb
      .from('analyses')
      .select('id, memo_data')
      .in('id', analysisIds)
    for (const row of (data ?? []) as { id: string; memo_data: MemoData }[]) {
      memoById.set(row.id, row.memo_data)
    }
  }

  const enrichedAlerts = alerts
    .filter(a => watchById.has(a.watchlist_id))
    .map(a => {
      const watch = watchById.get(a.watchlist_id)!
      return enrichAlert(a, watch, memoById.get(watch.analysis_id) ?? null)
    })

  return NextResponse.json({ alerts: enrichedAlerts })
}
