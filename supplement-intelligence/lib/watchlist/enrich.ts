// ── Watchlist enrichment — Phase 3 Watchlist UI integration ──────────────────
//
// Pure, non-JSX. Reuses the exact same real functions/derivations already
// built for the Investor Report (Roadmap M1.4/M2.2/M2.4) and Dashboard —
// no second, divergent calculation of verdict/quality/confidence anywhere
// in this codebase. This module's only new logic is the glue: reading the
// watchlist row's own real stage history and cross-referencing its real
// kill criteria against real, already-persisted alert rows.

import type { MemoData } from '@/types/index'
import type { LifecycleStage } from '@/lib/lifecycle'
import type { MarketVerdict, QualityTier } from '@/lib/verdict-matrix'
import { computeGroundedScore } from '@/lib/scoring'
import { computeConfidenceAssessment } from '@/lib/confidence'
import { deriveV2VerdictDisplay, formatGapVelocity } from '@/components/memo/field-derivations'
import type { WatchlistEntry, WatchlistAlert } from './types'

export interface EnrichedWatch {
  entry: WatchlistEntry

  // Roadmap M2.2 — real stage history. `previousStage` is null unless a
  // real stage change has actually been recorded since watching (the
  // watchlist row only ever stores the watch-time stage and the most
  // recent recheck's stage, not a full transition history — see
  // lib/watchlist/recheck.ts) — never a fabricated "previous" value.
  currentStage:  LifecycleStage | null
  previousStage: LifecycleStage | null

  // Roadmap M2.4 — real, parallel V2 verdict/quality. Null when the
  // watched analysis predates M2.4.
  marketVerdict: MarketVerdict | null
  qualityScore:  number | null
  qualityTier:   QualityTier | null

  // Roadmap M2.2 — real gap velocity, pre-formatted with its real sign
  // and unit (see formatGapVelocity). Null when unavailable.
  gapVelocityDisplay: string | null

  // Roadmap M1.4 — real independence-aware confidence, as a 0-100 percent.
  // Null when the watched analysis has no real confidence reading.
  confidencePct: number | null

  // Roadmap M2.8 — real kill criteria that have a real, persisted
  // kill_criteria_triggered alert on this exact watch. Never a live
  // re-evaluation (that is the re-check cron's job, not this page's) —
  // this reflects only what has actually been recorded so far, which may
  // be stale by up to one recheck cycle. Empty array (never fabricated)
  // when none have triggered, or none were ever defined.
  triggeredKillCriteria: string[]
}

// `memo` is the watched analysis's real, frozen MemoData (read from
// analyses.memo_data via the watch's own analysis_id) — null only when
// that analysis row itself can't be read (should not happen in practice
// given the FK, but never assumed). `watchAlerts` must already be
// filtered to this exact watch (the caller groups once, not per-watch).
export function enrichWatch(entry: WatchlistEntry, memo: MemoData | null, watchAlerts: WatchlistAlert[]): EnrichedWatch {
  const currentStage = entry.last_lifecycle_stage ?? entry.lifecycle_stage_at_watch
  const previousStage = entry.last_lifecycle_stage !== null && entry.last_lifecycle_stage !== entry.lifecycle_stage_at_watch
    ? entry.lifecycle_stage_at_watch
    : null

  let marketVerdict: MarketVerdict | null = null
  let qualityScore:  number | null = null
  let qualityTier:   QualityTier | null = null
  let gapVelocityDisplay: string | null = null
  let confidencePct: number | null = null

  if (memo) {
    const v2 = deriveV2VerdictDisplay(memo.opportunity_quality, memo.market_verdict)
    if (v2) {
      marketVerdict = v2.verdict
      qualityScore  = v2.qualityScore
      qualityTier   = v2.qualityTier
    }
    const gv = formatGapVelocity(memo.gap_velocity)
    if (gv) gapVelocityDisplay = gv.display

    const assessment = computeConfidenceAssessment(computeGroundedScore(memo))
    confidencePct = assessment.overallConfidence !== null ? Math.round(assessment.overallConfidence * 100) : null
  }

  const triggeredKeys = new Set(
    watchAlerts.filter(a => a.alert_type === 'kill_criteria_triggered' && a.kill_criterion_key).map(a => a.kill_criterion_key),
  )
  const triggeredKillCriteria = entry.kill_criteria.filter(c => triggeredKeys.has(c.key)).map(c => c.label)

  return {
    entry, currentStage, previousStage, marketVerdict, qualityScore, qualityTier,
    gapVelocityDisplay, confidencePct, triggeredKillCriteria,
  }
}
