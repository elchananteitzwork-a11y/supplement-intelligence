import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listAlerts } from '@/lib/watchlist/store'
import { enrichAlert } from '@/lib/watchlist/alerts-display'
import type { WatchlistEntry } from '@/lib/watchlist/types'
import type { MemoData } from '@/types/index'
import { Stream, type MovedItemVM } from '@/components/partner/Stream'

// ── /app — the Stream (V4 Phase 1, docs/V4_PRODUCT_ARCHITECTURE.md §5,
// docs/RD_V4_PHASE1.md). Auth pattern only reused from app/dashboard/
// page.tsx's own auth block — nothing visual. "What moved" reads the same
// real alert/re-check data GET /api/alerts serves (lib/watchlist/store +
// lib/watchlist/alerts-display, byte-identical enrichAlert computation),
// fetched directly here instead of via an internal HTTP round-trip to this
// app's own API route — the same direct-Supabase-read pattern already used
// by app/dashboard/page.tsx and app/memo/[id]/page.tsx for their own
// server-side reads.
export default async function StreamPage() {
  const sb = createClient()
  const { data: authData, error: authError } = await sb.auth.getUser()
  if (authError || !authData?.user) redirect('/login')
  const user = authData.user

  const alerts = await listAlerts(sb, user.id, 20)

  const watchlistIds = Array.from(new Set(alerts.map(a => a.watchlist_id)))
  const watchById = new Map<string, WatchlistEntry>()
  if (watchlistIds.length) {
    const { data } = await sb.from('watchlist').select('*').eq('user_id', user.id).in('id', watchlistIds)
    for (const row of (data ?? []) as WatchlistEntry[]) watchById.set(row.id, row)
  }

  const analysisIds = Array.from(new Set(Array.from(watchById.values()).map(w => w.analysis_id)))
  const memoById = new Map<string, MemoData>()
  if (analysisIds.length) {
    const { data } = await sb.from('analyses').select('id, memo_data').in('id', analysisIds)
    for (const row of (data ?? []) as { id: string; memo_data: MemoData }[]) memoById.set(row.id, row.memo_data)
  }

  const movedItems: MovedItemVM[] = alerts
    .filter(a => watchById.has(a.watchlist_id))
    .map(a => {
      const watch = watchById.get(a.watchlist_id)!
      const enriched = enrichAlert(a, watch, memoById.get(watch.analysis_id) ?? null)
      return {
        key:      enriched.alert.id,
        headline: enriched.headline,
        detail:   enriched.detail,
        severity: enriched.severity,
        href:     `/app/brief/${enriched.analysisId}`,
      }
    })

  return (
    <div className="min-h-screen bg-pi-cream text-pi-ink">
      <Stream movedItems={movedItems} />
    </div>
  )
}
