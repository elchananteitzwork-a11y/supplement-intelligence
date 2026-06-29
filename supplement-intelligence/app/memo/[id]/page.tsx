import { notFound, redirect } from 'next/navigation'
import Link                   from 'next/link'
import { createClient }       from '@/lib/supabase/server'
import type { Analysis }      from '@/types/index'
import MemoDisplay            from '@/components/MemoDisplay'
import FeedbackWidget         from '@/components/FeedbackWidget'
import OutcomeWidget          from '@/components/OutcomeWidget'
import CopyLinkButton         from '@/components/CopyLinkButton'

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
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-6xl mx-auto">

        {/* nav */}
        <div className="flex items-center justify-between mb-6 lg:max-w-[840px]">
          <Link href="/dashboard" className="btn-ghost text-xs -ml-2">← Analyses</Link>
          <div className="flex items-center gap-2">
            <CopyLinkButton />
            <Link href="/analyze" className="btn-dark text-xs py-2 px-4">+ New</Link>
          </div>
        </div>

        {/* memo */}
        <MemoDisplay memo={a.memo_data} generatedAt={a.created_at} />

        {/* outcome tracking */}
        <div className="mt-8 lg:max-w-[840px]">
          <p className="label mb-3">Outcome Tracking</p>
          <OutcomeWidget analysisId={a.id} />
        </div>

        {/* feedback */}
        <div className="mt-8 lg:max-w-[840px]">
          <p className="label mb-3">Feedback</p>
          <FeedbackWidget analysisId={a.id} />
        </div>

        {/* bottom nav */}
        <div className="mt-8 pt-6 border-t border-white/[0.06] flex justify-between lg:max-w-[840px]">
          <Link href="/dashboard"   className="btn-ghost text-sm">← Dashboard</Link>
          <Link href="/leaderboard" className="btn-ghost text-sm">Leaderboard →</Link>
        </div>
      </div>
    </div>
  )
}

