import { redirect }  from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Analysis, Profile } from '@/types/index'
import { AppShell } from '@/components/shell/AppShell'
import DashboardOpportunityCard from '@/components/dashboard/DashboardOpportunityCard'
import { StatTile } from '@/components/ui'
import { IconTarget } from '@/components/icons'
import { computeGroundedScore } from '@/lib/scoring'
import { computeConfidenceAssessment } from '@/lib/confidence'
import { deriveLifecycleDisplay, deriveV2VerdictDisplay, deriveScienceDisplay } from '@/components/memo/field-derivations'
import { deriveKillCriteriaCount } from '@/components/dashboard/derivations'
import {
  computeV2BuildRate, computeAvgQuality, computeLifecycleCoverage, computeAvgConfidence,
  type DashboardCardIntelligence,
} from '@/components/dashboard/aggregates'
import { isDevUnlimitedAnalysesEnabled } from '@/lib/billing/dev-bypass'

// Roadmap M2.2/M2.4/M1.4/M2.8/M2.5 (Phase 2 -> Dashboard integration).
// Computed exactly once per analysis, reused for both this card's own
// display and the portfolio-level aggregates below — never recomputed.
function computeCardIntelligence(a: Analysis): DashboardCardIntelligence & {
  killCriteriaCount: number; hasScience: boolean
} {
  const grounded = computeGroundedScore(a.memo_data)
  const confidenceAssessment = computeConfidenceAssessment(grounded)
  return {
    lifecycle:         deriveLifecycleDisplay(a.memo_data),
    v2Verdict:         deriveV2VerdictDisplay(a.memo_data.opportunity_quality, a.memo_data.market_verdict),
    confidencePct:      confidenceAssessment.overallConfidence !== null ? Math.round(confidenceAssessment.overallConfidence * 100) : null,
    killCriteriaCount: deriveKillCriteriaCount(a.memo_data),
    hasScience:        deriveScienceDisplay(a.memo_data.signal_evidence?.science?.value) !== null,
  }
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

  const [{ data: analyses }, { data: profile }] = await Promise.all([
    sb.from('analyses').select('*').eq('user_id', user.id).eq('is_archived', false).order('created_at', { ascending: false }).limit(30),
    sb.from('profiles').select('*').eq('id', user.id).single(),
  ])

  const list = (analyses ?? []) as Analysis[]
  const pro  = profile as Profile | null
  const used = pro?.analyses_used  ?? 0
  const limit = pro?.analyses_limit ?? 3
  const devUnlimited = isDevUnlimitedAnalysesEnabled()
  const left  = Math.max(0, limit - used)
  const canAnalyze = devUnlimited || left > 0

  const total     = list.length
  const avgScore  = total ? Math.round(list.reduce((s, a) => s + a.opportunity_score, 0) / total) : 0

  // Computed once per analysis; reused for both each card's own display
  // and the portfolio-level aggregates below (never recomputed).
  const cardIntel = list.map(computeCardIntelligence)
  const v2BuildRate        = computeV2BuildRate(cardIntel)
  const avgQuality         = computeAvgQuality(cardIntel)
  const lifecycleCoverage  = computeLifecycleCoverage(cardIntel)
  const avgConfidence      = computeAvgConfidence(cardIntel)

  return (
    <AppShell active="home" canAnalyze={canAnalyze} variant="pi">
      <div className="max-w-6xl">
        <div className="flex items-baseline justify-between mb-8 border-b border-pi-hairline pb-4">
          <h1 className="font-serif text-[28px] font-semibold leading-snug tracking-tight text-pi-ink sm:text-[32px]">Home</h1>
          <p className="text-xs font-mono text-pi-faint">{used}/{limit} analyses used · {total} total</p>
        </div>

        {total > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatTile variant="pi" label="Total Runs" value={String(total)} />
            {/* Roadmap M2.4 — replaces the legacy build_decision-based
                "Build Rate" tile. Real market_verdict.verdict === 'BUILD_NOW'
                rate over the analyses that actually have M2.4 data — never
                divided by the full (mostly pre-M2.4) total, which would
                silently understate the real rate. Honest "—" when zero
                analyses have been scored under the V2 model yet. */}
            <StatTile
              variant="pi"
              label="V2 Build Rate"
              value={v2BuildRate ? `${v2BuildRate.ratePct}%` : '—'}
              color={v2BuildRate && v2BuildRate.ratePct >= 50 ? '#2E6B48' : undefined}
            />
            <StatTile variant="pi" label="Avg Score" value={String(avgScore)} color={avgScore >= 65 ? '#2E6B48' : avgScore >= 50 ? '#8D6A16' : '#A13F2E'} />
            <StatTile variant="pi" label="Last Run" value={timeAgo(list[0]?.created_at)} />
            <StatTile
              variant="pi"
              label="Avg Quality (V2)"
              value={avgQuality ? `${avgQuality.avgScore}` : '—'}
              color={avgQuality && avgQuality.avgScore >= 70 ? '#2E6B48' : avgQuality && avgQuality.avgScore >= 45 ? '#8D6A16' : undefined}
            />
            <StatTile variant="pi" label="Lifecycle Classified" value={`${lifecycleCoverage.classifiedCount}/${lifecycleCoverage.totalCount}`} />
            <StatTile
              variant="pi"
              label="Avg Confidence"
              value={avgConfidence ? `${avgConfidence.avgPct}%` : '—'}
              color={avgConfidence && avgConfidence.avgPct >= 50 ? '#2E6B48' : avgConfidence && avgConfidence.avgPct >= 25 ? '#8D6A16' : undefined}
            />
          </div>
        )}

        {list.length === 0 ? (
          <div className="rounded-xl border border-pi-hairline bg-pi-card py-24 px-6 text-center">
            <div className="w-12 h-12 rounded-lg border border-pi-hairline flex items-center justify-center mx-auto mb-5">
              <IconTarget className="w-5 h-5 text-pi-ink" />
            </div>
            <h2 className="font-serif text-[22px] font-semibold leading-snug tracking-tight text-pi-ink mb-2">Run your first analysis</h2>
            <p className="text-sm text-pi-sub mb-8 max-w-xs mx-auto leading-relaxed">
              Type any product idea. Get a complete intelligence memo in 60 seconds.
            </p>
            {canAnalyze && (
              <Link
                href="/analyze"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-pi-ink px-6 py-3 text-sm font-semibold text-pi-cream shadow-[0_1px_3px_rgba(22,23,26,0.15)] transition-all duration-200 hover:-translate-y-px hover:bg-[#24262B] hover:shadow-[0_4px_10px_rgba(22,23,26,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright active:scale-[0.985]"
              >
                Start Analyzing →
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map((a, i) => (
              <DashboardOpportunityCard
                key={a.id}
                href={`/memo/${a.id}`}
                rank={i + 1}
                categoryName={a.category_name}
                score={a.opportunity_score}
                decision={a.build_decision}
                format={a.memo_data?.product_recommendation?.format}
                competitor={a.biggest_competitor}
                marketSize={a.market_size}
                timeLabel={timeAgo(a.created_at)}
                lifecycle={cardIntel[i].lifecycle}
                v2Verdict={cardIntel[i].v2Verdict}
                killCriteriaCount={cardIntel[i].killCriteriaCount}
                hasScience={cardIntel[i].hasScience}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
