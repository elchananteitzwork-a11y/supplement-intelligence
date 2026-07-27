import { redirect }  from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { LeaderboardRow, Profile, MemoData } from '@/types/index'
import { AvatarMenu } from '@/components/partner/AvatarMenu'
import TrackRecordOpportunityCard from '@/components/leaderboard/TrackRecordOpportunityCard'
import { computeGroundedScore } from '@/lib/scoring'
import { computeConfidenceAssessment } from '@/lib/confidence'
import { deriveLifecycleDisplay, deriveV2VerdictDisplay, type LifecycleDisplay, type V2VerdictDisplay } from '@/components/memo/field-derivations'

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
}

function computeRowIntelligence(memo: MemoData | null): TrackRecordIntelligence {
  if (!memo) {
    return { lifecycle: null, v2Verdict: null, confidencePct: null }
  }
  const grounded = computeGroundedScore(memo)
  const confidenceAssessment = computeConfidenceAssessment(grounded)
  return {
    lifecycle:     deriveLifecycleDisplay(memo),
    v2Verdict:     deriveV2VerdictDisplay(memo.opportunity_quality, memo.market_verdict),
    confidencePct: confidenceAssessment.overallConfidence !== null ? Math.round(confidenceAssessment.overallConfidence * 100) : null,
  }
}

// V4 shell pass (2026-07-27): AppShell/StatTile swapped for the AvatarMenu
// world; the four verdict counts render as an inline stat row in the same
// tone tokens. All data derivation above is byte-identical.
const STAT_TONES = [
  { label: 'Entry Supported',     text: 'text-pi-build' },
  { label: 'Validation Required', text: 'text-pi-gold' },
  { label: 'Category Creation',   text: 'text-pi-ink' },
  { label: 'Not Supported',       text: 'text-pi-risk' },
]

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
  const statValues = [build, validate, categoryCreation, skip]

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
    return computeRowIntelligence(best?.memo_data ?? null)
  })

  const pro   = profile as Profile | null
  const usage = pro ? { used: pro.analyses_used ?? 0, limit: pro.analyses_limit ?? 3 } : null

  return (
    <div className="min-h-screen bg-pi-cream pb-20 text-pi-ink">
      <AvatarMenu email={user.email ?? null} usage={usage} />
      <div className="mx-auto max-w-[960px] px-5 pt-12 sm:pt-16">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">
          Track Record · {rows.length} categories ranked
        </p>
        <h1 className="mb-1 font-serif text-[28px] font-semibold leading-snug tracking-tight">Every call, on the record.</h1>
        <p className="mb-8 text-sm text-pi-sub">Ranked by opportunity score across all researched categories.</p>

        <div className="mb-8 flex flex-wrap gap-x-8 gap-y-2 rounded-xl border border-pi-hairline bg-pi-card px-5 py-4 shadow-[0_1px_2px_rgba(22,23,26,0.04)]">
          {STAT_TONES.map((s, i) => (
            <div key={s.label}>
              <p className={`font-mono text-xl font-bold tabular-nums ${s.text}`}>{statValues[i]}</p>
              <p className="font-mono text-[10px] uppercase tracking-wide text-pi-faint">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            />
          ))}
        </div>

        <div className="mt-10 text-center">
          <a href="/app" className="text-sm text-pi-faint hover:text-pi-ink">← Back to the Stream</a>
        </div>
      </div>
    </div>
  )
}
