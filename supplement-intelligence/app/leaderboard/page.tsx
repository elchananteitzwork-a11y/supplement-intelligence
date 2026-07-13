import { redirect }  from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { LeaderboardRow, Profile, MemoData } from '@/types/index'
import { AppShell } from '@/components/shell/AppShell'
import TrackRecordOpportunityCard from '@/components/leaderboard/TrackRecordOpportunityCard'
import { StatTile } from '@/components/ui'
import { computeGroundedScore } from '@/lib/scoring'
import { computeConfidenceAssessment } from '@/lib/confidence'
import { deriveLifecycleDisplay, deriveV2VerdictDisplay, type LifecycleDisplay, type V2VerdictDisplay } from '@/components/memo/field-derivations'
import { deriveHistoricalOutcomeStatus, type HistoricalOutcomeStatus } from '@/components/leaderboard/derivations'
import { isDevUnlimitedAnalysesEnabled } from '@/lib/billing/dev-bypass'

function timeLabelFor(r: LeaderboardRow) {
  return `${r.analysis_count} run${r.analysis_count === 1 ? '' : 's'}`
}

// Roadmap M2.2/M2.4/M1.4/M2.9 (Phase 2 -> Track Record integration).
// Computed once per row from the real analyses row this leaderboard entry
// points at (best_analysis_id) — never a second calculation of anything
// already computed server-side.
interface TrackRecordIntelligence {
  lifecycle:         LifecycleDisplay | null
  v2Verdict:         V2VerdictDisplay | null
  confidencePct:     number | null
  historicalOutcome: HistoricalOutcomeStatus | null
}

function computeRowIntelligence(memo: MemoData | null, bestAnalysisCreatedAt: string | null): TrackRecordIntelligence {
  if (!memo) {
    return { lifecycle: null, v2Verdict: null, confidencePct: null, historicalOutcome: null }
  }
  const grounded = computeGroundedScore(memo)
  const confidenceAssessment = computeConfidenceAssessment(grounded)
  return {
    lifecycle:     deriveLifecycleDisplay(memo),
    v2Verdict:     deriveV2VerdictDisplay(memo.opportunity_quality, memo.market_verdict),
    confidencePct: confidenceAssessment.overallConfidence !== null ? Math.round(confidenceAssessment.overallConfidence * 100) : null,
    historicalOutcome: bestAnalysisCreatedAt ? deriveHistoricalOutcomeStatus(bestAnalysisCreatedAt) : null,
  }
}

export default async function Leaderboard() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const [{ data }, { data: profile }] = await Promise.all([
    sb.from('leaderboard').select('*').order('opportunity_score', { ascending: false }).limit(100),
    sb.from('profiles').select('*').eq('id', user.id).single(),
  ])

  const rows = (data ?? []) as LeaderboardRow[]
  const build            = rows.filter(r => r.build_decision === 'BUILD_NOW').length
  const validate         = rows.filter(r => r.build_decision === 'VALIDATE_FURTHER').length
  const skip             = rows.filter(r => r.build_decision === 'SKIP').length
  const categoryCreation = rows.filter(r => r.build_decision === 'CATEGORY_CREATION_CANDIDATE').length

  // Batched real read of each row's own best_analysis_id — the specific
  // analysis this leaderboard entry's score/decision came from — for its
  // full memo_data (Phase 2 fields). Never a per-row round trip.
  const analysisIds = rows.map(r => r.best_analysis_id).filter((id): id is string => !!id)
  const analysisById = new Map<string, { memo_data: MemoData; created_at: string }>()
  if (analysisIds.length) {
    const { data: analysisRows } = await sb
      .from('analyses')
      .select('id, memo_data, created_at')
      .in('id', analysisIds)
    for (const row of (analysisRows ?? []) as { id: string; memo_data: MemoData; created_at: string }[]) {
      analysisById.set(row.id, { memo_data: row.memo_data, created_at: row.created_at })
    }
  }

  const rowIntel = rows.map(r => {
    const best = r.best_analysis_id ? analysisById.get(r.best_analysis_id) : undefined
    return computeRowIntelligence(best?.memo_data ?? null, best?.created_at ?? null)
  })

  const pro   = profile as Profile | null
  const used  = pro?.analyses_used  ?? 0
  const limit = pro?.analyses_limit ?? 3
  const devUnlimited = isDevUnlimitedAnalysesEnabled()
  const canAnalyze = devUnlimited || used < limit

  return (
    <AppShell active="track" canAnalyze={canAnalyze}>
      <div className="max-w-6xl">
        <div className="flex items-baseline justify-between mb-8 border-b-2 border-black pb-4">
          <h1 className="text-headline-md text-black">Track Record</h1>
          <p className="font-mono text-xs text-outline">{rows.length} categories ranked</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatTile label="Entry Supported" value={String(build)} color="#008a00" />
          <StatTile label="Validation Required" value={String(validate)} color="#a67c00" />
          <StatTile label="Category Creation" value={String(categoryCreation)} color="#000000" />
          <StatTile label="Not Supported" value={String(skip)} color="#d32f2f" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r, i) => (
            <TrackRecordOpportunityCard
              key={r.id}
              rank={i + 1}
              categoryName={r.category_name}
              score={r.opportunity_score}
              decision={r.build_decision}
              competitor={r.biggest_competitor}
              marketSize={r.market_size}
              timeLabel={timeLabelFor(r)}
              lifecycle={rowIntel[i].lifecycle}
              v2Verdict={rowIntel[i].v2Verdict}
              confidencePct={rowIntel[i].confidencePct}
              historicalOutcome={rowIntel[i].historicalOutcome}
            />
          ))}
        </div>
      </div>
    </AppShell>
  )
}
