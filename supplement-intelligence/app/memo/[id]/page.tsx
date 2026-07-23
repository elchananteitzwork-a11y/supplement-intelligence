import { notFound, redirect } from 'next/navigation'
import Link                   from 'next/link'
import { createClient }       from '@/lib/supabase/server'
import type { Analysis }      from '@/types/index'
import { AppShell }           from '@/components/shell/AppShell'
import FeedbackWidget         from '@/components/FeedbackWidget'
import OutcomeWidget          from '@/components/OutcomeWidget'
import CopyLinkButton         from '@/components/CopyLinkButton'
import { buildCoreViewModel } from '@/components/pi/candidate-core'
import { MemoDetailBody }     from './MemoDetailBody'
import { listWatches, listAlerts } from '@/lib/watchlist/store'

export default async function MemoPage({ params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await sb
    .from('analyses').select('*').eq('id', params.id).single()

  if (error || !data) notFound()

  const a = data as Analysis
  if (a.user_id !== user.id) notFound()

  // UIv2-M2 Phase 1 — Core/hero summary layer. Reads the SAME already-
  // fetched `a.memo_data` MemoDisplay renders below; no new fetch of the
  // analysis itself. Watch entry/alerts are the only new reads (both
  // existing, RLS-respecting lib/watchlist/store.ts functions, read-only —
  // see components/pi/candidate-core/coreDataAdapter.ts's own HONESTY
  // CAVEAT for why a kill criterion's "triggered" state is only ever real
  // when a watchlist_alerts row already exists for it).
  const [watches, alerts] = await Promise.all([listWatches(sb, user.id), listAlerts(sb, user.id)])
  const watchEntry = watches.find(w => w.analysis_id === a.id) ?? null
  const coreVm = buildCoreViewModel(a.memo_data, { entry: watchEntry, alerts })

  return (
    <AppShell active={null} variant="pi">
      <div className="max-w-6xl">

        {/* sticky top bar — breadcrumb + actions, matching Stitch's
            Investor Report top app-bar (not just a back-link) */}
        <div className="sticky top-0 z-40 -mx-4 sm:-mx-10 px-4 sm:px-10 py-3 mb-8 bg-pi-cream border-b border-pi-hairline flex items-center justify-between gap-3 lg:max-w-none">
          <nav className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-pi-sub min-w-0">
            <Link href="/dashboard" className="hover:text-pi-ink transition-colors shrink-0">Analyses</Link>
            <span className="shrink-0">/</span>
            <span className="text-pi-ink font-bold truncate">{a.category_name}</span>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <CopyLinkButton />
            <Link
              href="/analyze"
              className="text-xs font-semibold px-4 py-2 rounded-lg text-pi-cream bg-pi-ink hover:bg-[#24262B] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright"
            >
              + New
            </Link>
          </div>
        </div>

        {/* Core/hero summary card (RD-UIv2-M4 cream reframe) + the
            Sources-gated full 14-section memo below it. The sourcesOpen
            toggle state lives in MemoDetailBody (a client component) —
            this page stays a Server Component doing the real Supabase
            fetch above; see MemoDetailBody.tsx's own header comment for
            why the state boundary sits there and not here. */}
        <MemoDetailBody
          vm={coreVm}
          categoryName={a.category_name}
          buildExplanation={a.memo_data.build_explanation}
          memo={a.memo_data}
          generatedAt={a.created_at}
        />

        {/* outcome tracking */}
        <div className="mt-8 max-w-[720px] mx-auto">
          <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-pi-faint mb-3">Outcome Tracking</p>
          <OutcomeWidget analysisId={a.id} />
        </div>

        {/* feedback */}
        <div className="mt-8 max-w-[720px] mx-auto">
          <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-pi-faint mb-3">Feedback</p>
          <FeedbackWidget analysisId={a.id} />
        </div>

        {/* bottom nav */}
        <div className="mt-8 pt-6 border-t border-pi-hairline flex justify-between max-w-[720px] mx-auto">
          <Link href="/dashboard"   className="text-sm font-mono uppercase text-pi-sub hover:text-pi-ink transition-colors">← Dashboard</Link>
          <Link href="/leaderboard" className="text-sm font-mono uppercase text-pi-sub hover:text-pi-ink transition-colors">Leaderboard →</Link>
        </div>
      </div>
    </AppShell>
  )
}
