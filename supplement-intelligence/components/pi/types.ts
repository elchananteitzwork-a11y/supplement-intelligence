// Product Intelligence v2 — Pipeline home view-model (UIv2-M1).
//
// The server route derives these from real rows via the audited helpers
// (computeGroundedScore etc.) — components below this line never touch
// memo_data and never re-derive anything.

export type PipelineStage = 'captured' | 'analyzed' | 'shortlisted' | 'committed' | 'killed'

export interface PipelineCandidate {
  id: string
  name: string
  stage: PipelineStage
  /** Grounded decision from computeGroundedScore — never raw build_decision. */
  decision: 'BUILD_NOW' | 'VALIDATE_FURTHER' | 'SKIP' | 'CATEGORY_CREATION_CANDIDATE'
  score: number
  /** True when the grounded scorer flagged insufficient evidence. */
  insufficientEvidence: boolean
  /** 0-100, or null when signal_metadata carried no overall confidence (honest null).
   *  UIv2-M3: CandidateRow no longer renders this per-row (the mockup's "no raw
   *  traced % on the front" rule, RD-UIv2-M3-home-rebuild.md) — kept on the type
   *  and still populated (real value, same computation as the portfolio-level
   *  Avg Confidence pulse figure) for any future per-row use, not dead data. */
  confidencePct: number | null
  createdAtIso: string
  memoHref: string
}

export interface ChangedItem {
  kind: 'analysis-complete' | 'stale-watch'
  candidateId: string
  name: string
  detail: string
  href: string
}

export interface PipelineViewModel {
  candidates: PipelineCandidate[]
  changed: ChangedItem[]
  /** Real counts behind the anchor sentence — computed server-side. */
  counts: { analyzed: number; shortlisted: number }
}
