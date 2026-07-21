// Server-side derivation of the Pipeline view-model from real rows.
// One place, reused by both the authed route and the dev-only preview —
// all numbers flow through the audited grounded scorer, never raw fields.

import { computeGroundedScore } from '@/lib/scoring'
import { computeConfidenceAssessment } from '@/lib/confidence'
import type { Analysis } from '@/types/index'
import type { ChangedItem, PipelineCandidate, PipelineViewModel } from './types'

const FRESH_WINDOW_MS = 48 * 3600 * 1000        // "analysis complete" strip window
const STALE_WATCH_MS = 21 * 24 * 3600 * 1000    // shortlisted evidence staleness threshold

export function derivePipelineViewModel(
  analyses: Analysis[],
  watchedAnalysisIds: Set<string>,
): PipelineViewModel {
  const now = Date.now()

  const candidates: PipelineCandidate[] = analyses.map(a => {
    const grounded = computeGroundedScore(a.memo_data)
    // UIv2-M2 fix (post-beta-walkthrough decision): this used to read
    // memo_data.signal_metadata.overall_confidence — a plain AVERAGE across
    // raw signal-collection dimensions (lib/signal-engine/engine.ts),
    // computed before scoring even runs. Candidate Detail's Core hero shows
    // a different real number for the exact same analysis: the weakest-link
    // verdict confidence from computeConfidenceAssessment (never averaged —
    // gated on the single weakest scored dimension). Both numbers are real;
    // showing two different "confidence" values for one analysis across two
    // screens was a trust bug, not an intentional distinction worth
    // preserving. Resolution: this is the ONE confidence number surfaced to
    // users anywhere in the product now — same source of truth as the
    // Core hero, computed the same conservative (never-inflated) way.
    const conf = computeConfidenceAssessment(grounded).overallConfidence
    return {
      id: a.id,
      name: a.category_name,
      stage: watchedAnalysisIds.has(a.id) ? 'shortlisted' : 'analyzed',
      decision: grounded.decision,
      score: grounded.score,
      insufficientEvidence: grounded.insufficientEvidence,
      confidencePct: typeof conf === 'number' ? Math.round(conf * 100) : null,
      createdAtIso: a.created_at,
      // UIv2-M2 fix: `a.id` is an `analyses` row id, not a `market_signals`
      // signal_id — `/research/[signal_id]/memo` is a different, older
      // feature keyed off that other table (see CompareResults.tsx's own
      // memoHref for the correct use of that route, from real thesis data).
      // This candidate's real detail page is /memo/[id] (Candidate Detail,
      // UIv2-M2 Phase 1+2) — the old route silently 404s/dead-ends for
      // every analysis created via the current Discover/Analyze pipeline,
      // found during the pre-beta end-to-end walkthrough.
      memoHref: `/memo/${a.id}`,
    }
  })

  const changed: ChangedItem[] = []
  for (const c of candidates) {
    const age = now - new Date(c.createdAtIso).getTime()
    if (age <= FRESH_WINDOW_MS) {
      changed.push({ kind: 'analysis-complete', candidateId: c.id, name: c.name, detail: 'analysis complete', href: c.memoHref })
    } else if (c.stage === 'shortlisted' && age >= STALE_WATCH_MS) {
      const weeks = Math.floor(age / (7 * 24 * 3600 * 1000))
      changed.push({ kind: 'stale-watch', candidateId: c.id, name: c.name, detail: `evidence is ${weeks} weeks old`, href: c.memoHref })
    }
  }

  return {
    candidates,
    changed,
    counts: {
      analyzed: candidates.filter(c => c.stage === 'analyzed').length,
      shortlisted: candidates.filter(c => c.stage === 'shortlisted').length,
    },
  }
}
