import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { MemoData, BuildDecision } from '@/types/index'
import { computeGroundedScore } from '@/lib/scoring'
import { positionVerdictLabel, VERDICT_TONE, INSUFFICIENT_EVIDENCE_TONE, freshnessStamp } from '@/lib/partner-copy'
import { AvatarMenu } from '@/components/partner/AvatarMenu'

// ── /app/desk — the Desk (docs/RD_V4_COMPARE_DESK.md, owner-approved
// mockup 2026-07-27). The positions strip grown into a full view
// (V4_PRODUCT_ARCHITECTURE.md §3): where each bet stands — state, verdict,
// the success metrics the user committed to, kill reasons, freshness.
// Deliberately NO score (its only surface is Compare, §3) and NO
// aggregate stats — the moment this accumulates analytics it has rebuilt
// the deleted dashboard (owner-approved refinement). Success metrics are
// listed as the commitment they are — there is no per-metric tracking
// data in the real positions table, so no invented "on track" status.
// Unlock ladder: exists only at 3+ positions.
const STATE_META: Record<string, { label: string; dot: string; text: string }> = {
  validating: { label: 'Validating', dot: 'bg-pi-build',     text: 'text-pi-build' },
  watching:   { label: 'Watching',   dot: 'bg-pi-gold-deep', text: 'text-pi-gold' },
  killed:     { label: 'Killed',     dot: 'bg-pi-faint',     text: 'text-pi-sub' },
}

export default async function DeskPage() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRow } = await sb.from('profiles').select('analyses_used, analyses_limit').eq('id', user.id).single()
  const usage = profileRow ? { used: profileRow.analyses_used ?? 0, limit: profileRow.analyses_limit ?? 3 } : null

  const { data: positionRows } = await sb
    .from('positions')
    .select('analysis_id, state, success_metrics, kill_reason, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const positions = (positionRows ?? []) as {
    analysis_id: string; state: string; success_metrics: string[] | null
    kill_reason: string | null; created_at: string
  }[]

  if (positions.length < 3) redirect('/app')

  const ids = positions.map(p => p.analysis_id)
  const { data: analysisRows } = await sb
    .from('analyses')
    .select('id, category_name, build_decision, created_at, memo_data')
    .in('id', ids)

  const byId = new Map(((analysisRows ?? []) as {
    id: string; category_name: string; build_decision: BuildDecision; created_at: string; memo_data: MemoData
  }[]).map(a => [a.id, a]))

  const cards = positions
    .map(p => {
      const a = byId.get(p.analysis_id)
      if (!a) return null
      const insufficientEvidence = computeGroundedScore(a.memo_data).insufficientEvidence
      return { ...p, categoryName: a.category_name, decision: a.build_decision, insufficientEvidence, analysisCreatedAt: a.created_at }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)

  const live = cards.filter(c => c.state !== 'killed')
  const killed = cards.filter(c => c.state === 'killed')

  return (
    <div className="min-h-screen bg-pi-cream pb-20 text-pi-ink">
      <AvatarMenu email={user.email ?? null} usage={usage} />
      <div className="mx-auto max-w-[640px] px-5 pt-12 sm:pt-16">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">
          The Desk · {live.length} {live.length === 1 ? 'position' : 'positions'}
        </p>
        <h1 className="mb-1 font-serif text-[28px] font-semibold leading-snug tracking-tight">Where each bet stands.</h1>
        <p className="mb-8 text-sm text-pi-sub">Re-checked weekly. The score lives on Compare, not here.</p>

        <ul className="space-y-3">
          {[...live, ...killed].map(c => {
            const meta = STATE_META[c.state] ?? STATE_META.watching
            const tone = c.insufficientEvidence ? INSUFFICIENT_EVIDENCE_TONE : VERDICT_TONE[c.decision]
            const metrics = Array.isArray(c.success_metrics) ? c.success_metrics : []
            return (
              <li key={c.analysis_id} className={c.state === 'killed' ? 'opacity-60' : ''}>
                <Link
                  href={`/app/brief/${c.analysis_id}`}
                  className="block rounded-xl border border-pi-hairline bg-pi-card px-5 py-4 shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-all duration-200 hover:-translate-y-px hover:border-pi-ink/25 hover:shadow-[0_6px_16px_-4px_rgba(22,23,26,0.12)]"
                >
                  <p className={`mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${meta.text}`}>
                    <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </p>
                  <p className="font-serif text-[17px] font-semibold">{c.categoryName}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-pi-sub">
                    <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                    {positionVerdictLabel(c.decision, c.insufficientEvidence)}
                    <span className="text-pi-faint">· {freshnessStamp(c.analysisCreatedAt)}</span>
                  </p>
                  {c.state === 'killed' && c.kill_reason && (
                    <p className="mt-2 text-[12.5px] text-pi-sub">Recorded as a save — {c.kill_reason}</p>
                  )}
                  {c.state !== 'killed' && metrics.length > 0 && (
                    <div className="mt-2.5 border-t border-pi-hairline pt-2.5">
                      <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-pi-faint">What you committed to watch</p>
                      {metrics.slice(0, 3).map((m, i) => (
                        <p key={i} className="text-[12.5px] leading-relaxed text-pi-sub">— {m}</p>
                      ))}
                    </div>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="mt-8 flex justify-center gap-5 text-sm">
          <Link href="/app/compare" className="text-pi-gold hover:underline">Compare these →</Link>
          <Link href="/app" className="text-pi-faint hover:text-pi-ink">← Back to the Stream</Link>
        </div>
      </div>
    </div>
  )
}
