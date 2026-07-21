import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { derivePipelineViewModel } from '@/components/pi/derive'
import type { Analysis } from '@/types/index'
import { CompareContent } from './CompareContent'

// Rewired (2026-07-2x) onto the real `analyses` pipeline — this used to be a
// pure client component fetching the old, unused investment_theses/
// market_signals history endpoints. The selection phase now needs the same
// real, RLS-scoped `analyses` + `watchlist` fetch /pipeline already does
// (app/pipeline/page.tsx), so this is now a server component doing that
// exact fetch + derivePipelineViewModel, handing the derived candidates down
// to the interactive (ids-param/selection-state) client component.
export const dynamic = 'force-dynamic'

export default async function ComparePage() {
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

  return <CompareContent candidates={vm.candidates} />
}
