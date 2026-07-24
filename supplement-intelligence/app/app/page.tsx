import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listAlerts } from '@/lib/watchlist/store'
import { enrichAlert } from '@/lib/watchlist/alerts-display'
import type { WatchlistEntry } from '@/lib/watchlist/types'
import type { MemoData } from '@/types/index'
import { buildOpportunities, type OpportunityRow } from '@/lib/opportunities'
import { Stream, type MovedItemVM } from '@/components/partner/Stream'
import { AvatarMenu } from '@/components/partner/AvatarMenu'

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

  // Real quota for the AvatarMenu's usage card — same profiles columns
  // /dashboard and /settings/billing already render; no invented numbers
  // (menu simply omits the card when the row is missing).
  const { data: profileRow } = await sb.from('profiles').select('analyses_used, analyses_limit').eq('id', user.id).single()
  const usage = profileRow ? { used: profileRow.analyses_used ?? 0, limit: profileRow.analyses_limit ?? 3 } : null

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
        key:        enriched.alert.id,
        analysisId: enriched.analysisId,
        headline:   enriched.headline,
        detail:     enriched.detail,
        severity:   enriched.severity,
        href:       `/app/brief/${enriched.analysisId}`,
      }
    })

  // Milestone D: "Opportunities worth a look" — the user's own past
  // positive-verdict analyses, deduped via the real supersede rule
  // (lib/opportunities.ts). RLS already scopes `analyses` to its owner
  // ("owner all" using auth.uid() = user_id); the explicit .eq below is
  // defense-in-depth, matching the ownership-check convention already used
  // in app/app/brief/[id]/page.tsx.
  const { data: opportunityRows } = await sb
    .from('analyses')
    .select('id, category_name, scoring_version, build_decision, opportunity_score, created_at')
    .eq('user_id', user.id)
    .in('build_decision', ['BUILD_NOW', 'CATEGORY_CREATION_CANDIDATE'])

  const opportunities = buildOpportunities(
    ((opportunityRows ?? []) as {
      id: string; category_name: string; scoring_version: string | null
      build_decision: OpportunityRow['buildDecision']; opportunity_score: number; created_at: string
    }[]).map(r => ({
      id: r.id,
      categoryName: r.category_name,
      scoringVersion: r.scoring_version,
      buildDecision: r.build_decision,
      opportunityScore: r.opportunity_score,
      createdAt: r.created_at,
    })),
  )

  return (
    <div className="min-h-screen bg-pi-cream text-pi-ink">
      <AvatarMenu email={user.email ?? null} usage={usage} />
      <Stream movedItems={movedItems} opportunities={opportunities} />
    </div>
  )
}
