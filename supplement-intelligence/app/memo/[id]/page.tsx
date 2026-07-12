import { notFound, redirect } from 'next/navigation'
import Link                   from 'next/link'
import { createClient }       from '@/lib/supabase/server'
import type { Analysis }      from '@/types/index'
import { AppShell }           from '@/components/shell/AppShell'
import MemoDisplay            from '@/components/memo/MemoDisplay'
import FeedbackWidget         from '@/components/FeedbackWidget'
import OutcomeWidget          from '@/components/OutcomeWidget'
import CopyLinkButton         from '@/components/CopyLinkButton'
import { PrimaryLinkButton } from '@/components/ui'

export default async function MemoPage({ params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await sb
    .from('analyses').select('*').eq('id', params.id).single()

  if (error || !data) notFound()

  const a = data as Analysis
  if (a.user_id !== user.id) notFound()

  return (
    <AppShell active={null}>
      <div className="max-w-6xl">

        {/* sticky top bar — breadcrumb + actions, matching Stitch's
            Investor Report top app-bar (not just a back-link) */}
        <div className="sticky top-0 z-40 -mx-4 sm:-mx-10 px-4 sm:px-10 py-3 mb-8 bg-surface border-b-2 border-black flex items-center justify-between gap-3 lg:max-w-none">
          <nav className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-outline min-w-0">
            <Link href="/dashboard" className="hover:text-black transition-colors shrink-0">Analyses</Link>
            <span className="shrink-0">/</span>
            <span className="text-black font-bold truncate">{a.category_name}</span>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <CopyLinkButton />
            <PrimaryLinkButton href="/analyze" className="text-xs px-4 py-2">+ New</PrimaryLinkButton>
          </div>
        </div>

        {/* memo */}
        <MemoDisplay memo={a.memo_data} generatedAt={a.created_at} />

        {/* outcome tracking */}
        <div className="mt-8 max-w-[720px] mx-auto">
          <p className="text-label-mono font-mono uppercase tracking-[0.14em] text-outline mb-3">Outcome Tracking</p>
          <OutcomeWidget analysisId={a.id} />
        </div>

        {/* feedback */}
        <div className="mt-8 max-w-[720px] mx-auto">
          <p className="text-label-mono font-mono uppercase tracking-[0.14em] text-outline mb-3">Feedback</p>
          <FeedbackWidget analysisId={a.id} />
        </div>

        {/* bottom nav */}
        <div className="mt-8 pt-6 border-t-2 border-black flex justify-between max-w-[720px] mx-auto">
          <Link href="/dashboard"   className="text-sm font-mono uppercase text-ink-variant hover:text-black transition-colors">← Dashboard</Link>
          <Link href="/leaderboard" className="text-sm font-mono uppercase text-ink-variant hover:text-black transition-colors">Leaderboard →</Link>
        </div>
      </div>
    </AppShell>
  )
}
