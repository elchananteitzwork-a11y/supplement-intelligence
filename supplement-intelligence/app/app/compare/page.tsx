import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { BuildDecision } from '@/types/index'
import { AvatarMenu } from '@/components/partner/AvatarMenu'
import { CompareView } from '@/components/partner/compare/CompareView'

// ── /app/compare — V4 Compare (docs/RD_V4_COMPARE_DESK.md, owner-approved
// mockup 2026-07-27: conclusion first, "Show me the numbers" expands the
// table on the same page). Unlock ladder (V4_PRODUCT_ARCHITECTURE.md §4):
// exists only at 2+ non-killed positions — below that, back to the Stream
// (no ghost screen). Selection: any of the user's analyses, with active
// positions preselected (owner-approved refinement #3).
export default async function ComparePage() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRow } = await sb.from('profiles').select('analyses_used, analyses_limit').eq('id', user.id).single()
  const usage = profileRow ? { used: profileRow.analyses_used ?? 0, limit: profileRow.analyses_limit ?? 3 } : null

  const { data: positionRows } = await sb
    .from('positions')
    .select('analysis_id, state')
    .eq('user_id', user.id)

  const activePositionIds = (positionRows ?? [])
    .filter((p: { state: string }) => p.state !== 'killed')
    .map((p: { analysis_id: string }) => p.analysis_id)

  if (activePositionIds.length < 2) redirect('/app')

  const { data: analysisRows } = await sb
    .from('analyses')
    .select('id, category_name, build_decision, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const candidates = ((analysisRows ?? []) as {
    id: string; category_name: string; build_decision: BuildDecision; created_at: string
  }[]).map(r => ({
    id: r.id,
    categoryName: r.category_name,
    decision: r.build_decision,
    createdAt: r.created_at,
    isPosition: activePositionIds.includes(r.id),
  }))

  return (
    <div className="min-h-screen bg-pi-cream pb-20 text-pi-ink">
      <AvatarMenu email={user.email ?? null} usage={usage} />
      <CompareView candidates={candidates} defaultSelectedIds={activePositionIds.slice(0, 4)} />
    </div>
  )
}
