import type { Stage1Evidence } from '../evidence/adapter'
import { assessLaunchThresholds } from './launch-threshold'

// ── Opportunity Score ──────────────────────────────────────────────────────
// Deterministic 0–100 composite derived from Stage 1 launch thresholds +
// Stage 4 market verdict. AI cannot override this score.
//
// Data-integrity fix (2026-07-18 audit, Finding 8): app/api/research/compare
// /route.ts and app/api/research/history/route.ts each hard-coded an
// independent copy of this formula — one divided pass_count by
// thresholds.checks.length (correctly scales if the check count changes),
// the other multiplied pass_count by a hard-coded 14 (only correct because
// there happen to be exactly 5 checks today: 5*14=70). They produced
// identical output only by coincidence and would silently diverge the
// moment a 6th threshold check is added to launch-threshold.ts. This module
// is now the single source of truth both routes import — the
// division-by-checks-length version was kept since it is the one that stays
// correct regardless of how many checks assessLaunchThresholds evaluates.
export function computeOpportunityScore(evidence: Stage1Evidence, verdictCode: string | null): number {
  const thresholds = assessLaunchThresholds(evidence)
  const total = Math.max(1, thresholds.checks.length)
  const base = Math.round((thresholds.pass_count / total) * 70)  // 0..70

  if (!verdictCode) return base
  switch (verdictCode) {
    case 'PURSUE':               return Math.min(100, base + 30)
    case 'PURSUE_WITH_CAUTION':  return Math.min(100, base + 15)
    case 'INVESTIGATE_FURTHER':  return base
    case 'DO_NOT_PURSUE':        return Math.max(0, base - 20)
    default:                     return base
  }
}
