import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { LazyMotion, domAnimation } from 'framer-motion'
import { createClient } from '@/lib/supabase/server'
import type { Analysis, Profile } from '@/types/index'
import { HomeShell } from '@/components/pi/HomeShell'
import { AttentionCard, type AttentionItemVM } from '@/components/pi/AttentionCard'
import { StageGroup } from '@/components/pi/StageGroup'
import { CandidateRow } from '@/components/pi/CandidateRow'
import { DECISION_CHIP } from '@/components/pi/decisionChip'
import { derivePipelineViewModel } from '@/components/pi/derive'
import { confidenceTier } from '@/components/pi/confidenceTier'
import { cn } from '@/lib/cn'
import { computeGroundedScore, type GroundedScore } from '@/lib/scoring'
import { computeConfidenceAssessment } from '@/lib/confidence'
import { deriveLifecycleDisplay, deriveV2VerdictDisplay, deriveScienceDisplay } from '@/components/memo/field-derivations'
import { deriveKillCriteriaCount } from '@/components/dashboard/derivations'
import {
  computeV2BuildRate, computeLifecycleCoverage, computeAvgConfidence,
  type DashboardCardIntelligence,
} from '@/components/dashboard/aggregates'
import { isDevUnlimitedAnalysesEnabled } from '@/lib/billing/dev-bypass'

// UIv2-M3 Home rebuild — merges the former /pipeline route's watchlist
// fetch + derivePipelineViewModel call into this page (see RD-UIv2-M3-
// home-rebuild.md). Canonical URL stays /dashboard; only what it renders
// changes. Every number below flows through the SAME already-audited
// functions the old /dashboard and /pipeline used — none are re-derived.

// Roadmap M2.2/M2.4/M1.4/M2.8/M2.5 (Phase 2 -> Dashboard integration).
// Computed exactly once per analysis, reused for both this page's own
// derivePipelineViewModel-adjacent display and the portfolio-level
// aggregates below — never recomputed. Reused verbatim from the pre-
// rebuild /dashboard.
//
// UIv2-M3 simplify pass: also returns the raw `grounded` result so the
// caller can hand it to derivePipelineViewModel's `precomputed` map instead
// of that function independently re-running computeGroundedScore +
// computeConfidenceAssessment (the same ~1500-line scoring pass) a second
// time per analysis, which is what a naive merge of /dashboard + /pipeline
// would otherwise do.
function computeCardIntelligence(a: Analysis): DashboardCardIntelligence & {
  killCriteriaCount: number; hasScience: boolean; grounded: GroundedScore
} {
  const grounded = computeGroundedScore(a.memo_data)
  const confidenceAssessment = computeConfidenceAssessment(grounded)
  return {
    lifecycle:         deriveLifecycleDisplay(a.memo_data),
    v2Verdict:         deriveV2VerdictDisplay(a.memo_data.opportunity_quality, a.memo_data.market_verdict),
    confidencePct:      confidenceAssessment.overallConfidence !== null ? Math.round(confidenceAssessment.overallConfidence * 100) : null,
    killCriteriaCount: deriveKillCriteriaCount(a.memo_data),
    hasScience:        deriveScienceDisplay(a.memo_data.signal_evidence?.science?.value) !== null,
    grounded,
  }
}

// UIv2-M3 simplify pass: the pulse row's four figures share one shape
// (mono value + mono uppercase label, optional color) — one small renderer
// instead of four copy-pasted spans.
function PulseFigure({ value, label, color, node }: { value?: string; label: string; color?: string; node?: ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5">
      {node ?? (
        <span className="font-mono text-[15px] font-bold tabular-nums text-pi-ink" style={color ? { color } : undefined}>
          {value}
        </span>
      )}
      <span className="font-mono text-[10px] uppercase tracking-wide text-pi-sub">{label}</span>
    </span>
  )
}

function timeAgo(d: string | null | undefined) {
  if (!d) return 'unknown'
  const t = new Date(d).getTime()
  if (isNaN(t)) return 'unknown'
  const diff = Math.floor((Date.now() - t) / 1000)
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default async function Dashboard() {
  const sb = createClient()
  const { data: authData, error: authError } = await sb.auth.getUser()
  if (authError || !authData?.user) redirect('/login')
  const user = authData.user

  const [{ data: analyses }, { data: profile }, { data: watches }] = await Promise.all([
    sb.from('analyses').select('*').eq('user_id', user.id).eq('is_archived', false).order('created_at', { ascending: false }).limit(30),
    sb.from('profiles').select('*').eq('id', user.id).single(),
    // Merged from the former app/pipeline/page.tsx — identical shape/filter.
    sb.from('watchlist').select('analysis_id').eq('user_id', user.id).eq('active', true),
  ])

  const list = (analyses ?? []) as Analysis[]
  const pro  = profile as Profile | null
  const used = pro?.analyses_used  ?? 0
  const limit = pro?.analyses_limit ?? 3
  const devUnlimited = isDevUnlimitedAnalysesEnabled()
  const left  = Math.max(0, limit - used)
  const canAnalyze = devUnlimited || left > 0

  const total = list.length

  // Computed once per analysis; reused for both each card's own display
  // and the portfolio-level aggregates below (never recomputed).
  const cardIntel = list.map(computeCardIntelligence)
  // Independent-review fix (UIv2-M3): this used to average the stored,
  // generation-time `a.opportunity_score` snapshot, while every CandidateRow
  // below shows `grounded.score` freshly re-derived from the current scoring
  // formula (components/pi/derive.ts). Old /dashboard and old /pipeline each
  // showed only one or the other, consistently — merging them onto one
  // screen with two different score sources made the pulse row's average
  // silently disagree with the rows underneath for any analysis scored
  // under an older `scoring_version` (see types/index.ts's own comment on
  // that field), and directly contradicted this page's own footer claim
  // that no number here is re-derived. Now uses the same grounded score
  // as every row, so the two always reconcile.
  const avgScore = total ? Math.round(cardIntel.reduce((s, ci) => s + ci.grounded.score, 0) / total) : 0
  const v2BuildRate        = computeV2BuildRate(cardIntel)
  const lifecycleCoverage  = computeLifecycleCoverage(cardIntel)
  const avgConfidence      = computeAvgConfidence(cardIntel)
  const confTier           = avgConfidence ? confidenceTier(avgConfidence.avgPct) : null

  const watchedIds = new Set<string>((watches ?? []).map((w: { analysis_id: string }) => w.analysis_id))
  // Hand computeCardIntelligence's already-computed grounded score/confidence
  // to derivePipelineViewModel instead of letting it recompute both from
  // scratch — see the comment on computeCardIntelligence above.
  const precomputed = new Map(list.map((a, i) => [a.id, { grounded: cardIntel[i].grounded, confidencePct: cardIntel[i].confidencePct }]))
  const vm = derivePipelineViewModel(list, watchedIds, precomputed)
  const shortlisted = vm.candidates.filter(c => c.stage === 'shortlisted')
  const analyzedRows = vm.candidates.filter(c => c.stage === 'analyzed')
  const candidateById = new Map(vm.candidates.map(c => [c.id, c]))

  const attentionItems: AttentionItemVM[] = vm.changed.map(item => {
    const candidate = candidateById.get(item.candidateId)
    const isComplete = item.kind === 'analysis-complete'
    return {
      key: `${item.kind}-${item.candidateId}`,
      kind: item.kind,
      name: item.name,
      href: item.href,
      message: isComplete
        ? `finished analyzing — verdict: ${candidate ? DECISION_CHIP[candidate.decision].label : 'unknown'}, score ${candidate?.score ?? '—'}.`
        : `is shortlisted but its ${item.detail}.`,
      whenLabel: isComplete ? timeAgo(candidate?.createdAtIso) : 'watched',
      actionLabel: isComplete ? 'Read the verdict →' : 'Re-check evidence →',
    }
  })

  const shortlistedCount = vm.counts.shortlisted
  const attentionCount = attentionItems.length
  const eyebrowDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <div className="min-h-screen bg-pi-cream text-pi-ink">
      <HomeShell canAnalyze={canAnalyze} quotaLabel={`${used}/${limit} analyses used`} />

      {/* CandidateRow/StageGroup/AttentionCard all render framer-motion `m`
          elements, which need a LazyMotion provider up the tree or they
          stay stuck at their `initial` (opacity: 0) style forever — same
          convention PipelineView.tsx used before this page absorbed it. */}
      <LazyMotion features={domAnimation} strict>
      <main className="mx-auto max-w-[880px] px-5 pb-24 pt-10 sm:px-7 sm:pt-14">
        {/* Altitude 1: the answer — real counts, nothing else competing */}
        <header className="mb-11">
          <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">
            Your pipeline · {eyebrowDate}
          </p>
          <h1 className="max-w-[24ch] font-serif text-[26px] font-semibold leading-snug tracking-tight text-pi-ink sm:text-[36px]">
            {total === 0 ? (
              'Your pipeline is empty. It won’t stay that way.'
            ) : (
              <>
                {total} candidate{total === 1 ? '' : 's'}.
                {shortlistedCount > 0 && <> {shortlistedCount} being watched</>}
                {attentionCount > 0 ? (
                  <>
                    {' '}— <span className="text-pi-gold">{attentionCount} need{attentionCount === 1 ? 's' : ''} your attention.</span>
                  </>
                ) : (
                  shortlistedCount > 0 && '.'
                )}
              </>
            )}
          </h1>
          {total > 0 && (
            <p className="mt-2.5 text-sm text-pi-sub">Last analysis finished {timeAgo(list[0]?.created_at)}.</p>
          )}

          {total > 0 && (
            <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-3">
              <PulseFigure
                label="V2 build rate"
                value={v2BuildRate ? `${v2BuildRate.ratePct}%` : '—'}
                color={v2BuildRate && v2BuildRate.ratePct >= 50 ? '#2E6B48' : undefined}
              />

              <PulseFigure label="Avg score" value={String(avgScore)} />

              <PulseFigure
                label="Avg confidence"
                node={
                  <span className="inline-flex items-baseline gap-1.5">
                    <span className="font-mono text-[15px] font-bold text-pi-ink">{confTier ? confTier.label : '—'}</span>
                    {confTier && (
                      <span className="inline-flex gap-[3px]" aria-hidden>
                        {[1, 2, 3].map(i => (
                          <span
                            key={i}
                            className={cn(
                              'inline-block h-[6px] w-[6px] rounded-full',
                              i <= confTier.dotsFilled ? 'bg-pi-ink' : 'border border-pi-sub bg-transparent',
                            )}
                          />
                        ))}
                      </span>
                    )}
                  </span>
                }
              />

              <PulseFigure
                label="Lifecycle classified"
                value={`${lifecycleCoverage.classifiedCount}/${lifecycleCoverage.totalCount}`}
              />

              {/* Unresolved per RD-UIv2-M3 §4 Risks — honestly disabled, not a
                  fake link, until a real "Sources" destination is decided.
                  Each row below already opens the full verdict via its own →. */}
              <span
                role="link"
                aria-disabled="true"
                title="Not yet available — each candidate's own → below already opens its full verdict page"
                className="ml-auto cursor-not-allowed self-center text-[11.5px] font-semibold text-pi-faint"
              >
                Sources →
              </span>
            </div>
          )}
        </header>

        {/* Altitude 2: needs your attention — real derivable events only, honest zero-state */}
        {total > 0 && (
          <section className="mb-11">
            <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Needs your attention</p>
            {attentionItems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-pi-ink/15 px-5 py-4 text-[13px] text-pi-sub">
                Nothing needs your attention right now.
              </p>
            ) : (
              <ul className="grid gap-2.5">
                {attentionItems.map((item, i) => (
                  <AttentionCard key={item.key} item={item} index={i} />
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Altitude 3: the pipeline — stage-grouped, scannable rows, honest ghosts */}
        <section>
          <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">The pipeline</p>

          <StageGroup name="Shortlisted" count={shortlisted.length} hint="Ideas you're serious about. Shortlisting arms monitoring — the product starts watching your back.">
            {shortlisted.map((c, i) => <CandidateRow key={c.id} c={c} index={i} />)}
          </StageGroup>

          <StageGroup name="Analyzed" count={analyzedRows.length} hint="Every idea the engine has examined lands here with its verdict.">
            {analyzedRows.map((c, i) => <CandidateRow key={c.id} c={c} index={i} />)}
          </StageGroup>

          <StageGroup name="Hunches" count={0} ghost hint="Ideas noted before analysis — arriving in a later release." />
          <StageGroup name="Committed / Killed" count={0} ghost hint="Commitment and kill records arrive with the ritual flows — nothing is hidden here, they don't exist yet." />
        </section>

        <p className="mt-14 border-t border-pi-hairline pt-5 text-xs leading-relaxed text-pi-sub">
          Every number on this page traces to your real stored analyses — verdicts, scores, and confidence are
          never re-derived for display. Confidence is gated by an analysis's single weakest input, never averaged.
          Dashed stages exist in the product model but have no data yet.
        </p>
      </main>
      </LazyMotion>
    </div>
  )
}
