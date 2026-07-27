import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { MemoData, BuildDecision } from '@/types/index'
import { computeGroundedScore } from '@/lib/scoring'
import { positionVerdictLabel, VERDICT_TONE, INSUFFICIENT_EVIDENCE_TONE } from '@/lib/partner-copy'
import { AvatarMenu } from '@/components/partner/AvatarMenu'

// ── /app/analyses — All analyses (screen-consolidation pass, 2026-07-27).
// The V4 replacement for the deleted legacy /dashboard: ONE complete,
// chronological list of every analysis the user has run, all verdicts,
// each row opening its Brief. Same ledger-row language as the Stream's
// Recent hunts. Verdict labels go through the same honesty rule as
// everywhere else in this namespace: a stored 'SKIP' can be an internal
// insufficient-evidence artifact, so the label is derived per row from
// the real memo_data via computeGroundedScore, never from the raw
// persisted decision alone.
export default async function AnalysesPage() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRow } = await sb.from('profiles').select('analyses_used, analyses_limit').eq('id', user.id).single()
  const usage = profileRow ? { used: profileRow.analyses_used ?? 0, limit: profileRow.analyses_limit ?? 3 } : null

  const { data: rows } = await sb
    .from('analyses')
    .select('id, category_name, build_decision, created_at, memo_data')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const items = ((rows ?? []) as {
    id: string; category_name: string; build_decision: BuildDecision
    created_at: string; memo_data: MemoData
  }[]).map(r => ({
    id: r.id,
    categoryName: r.category_name,
    decision: r.build_decision,
    insufficientEvidence: computeGroundedScore(r.memo_data).insufficientEvidence,
    createdAt: r.created_at,
  }))

  return (
    <div className="min-h-screen bg-pi-cream pb-20 text-pi-ink">
      <AvatarMenu email={user.email ?? null} usage={usage} />
      <div className="mx-auto max-w-[640px] px-5 pt-12 sm:pt-16">
        <div className="mb-8">
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">All analyses</p>
          <h1 className="font-serif text-[28px] font-semibold leading-snug tracking-tight">
            Everything you&rsquo;ve hunted.
          </h1>
          <p className="mt-1 text-sm text-pi-sub">
            {items.length} {items.length === 1 ? 'analysis' : 'analyses'}, newest first.
          </p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-pi-hairline bg-pi-card p-10 text-center shadow-[0_1px_3px_rgba(22,23,26,0.05)]">
            <p className="mb-4 text-sm text-pi-sub">Nothing here yet — run your first hunt and it will show up.</p>
            <Link href="/app" className="text-sm text-pi-gold hover:underline">Start a hunt →</Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map(item => {
              const tone = item.insufficientEvidence ? INSUFFICIENT_EVIDENCE_TONE : VERDICT_TONE[item.decision]
              return (
                <li key={item.id}>
                  <Link
                    href={`/app/brief/${item.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-pi-hairline bg-pi-card px-4 py-3.5 shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-all duration-200 hover:-translate-y-px hover:border-pi-ink/25 hover:shadow-[0_6px_16px_-4px_rgba(22,23,26,0.12)]"
                  >
                    <span className="flex min-w-0 items-baseline gap-2.5">
                      <span className="truncate text-sm text-pi-ink">{item.categoryName}</span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-pi-faint">
                        {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-pi-sub">
                      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                      {positionVerdictLabel(item.decision, item.insufficientEvidence)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-8 text-center">
          <Link href="/app" className="text-sm text-pi-gold hover:underline">← Back to the Stream</Link>
        </div>
      </div>
    </div>
  )
}
