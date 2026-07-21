import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PipelineView } from '@/components/pi/PipelineView'
import { derivePipelineViewModel } from '@/components/pi/derive'
import type { Analysis } from '@/types/index'

// UIv2-M1 — Pipeline home (Screen Definition S1), read-only v1.
// Isolated new route: reachable by URL, not yet linked from the legacy nav —
// cutover to home happens later under the staged-cutover policy.

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: analyses }, { data: watches }] = await Promise.all([
    sb.from('analyses')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(50),
    sb.from('watchlist')
      .select('analysis_id')
      .eq('user_id', user.id)
      .eq('active', true),
  ])

  const watchedIds = new Set<string>((watches ?? []).map((w: { analysis_id: string }) => w.analysis_id))
  const vm = derivePipelineViewModel((analyses ?? []) as Analysis[], watchedIds)

  return <PipelineView vm={vm} />
}
