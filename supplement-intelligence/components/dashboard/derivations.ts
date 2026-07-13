// ═══════════════════════════════════════════════════════════════════════
// components/dashboard/derivations.ts — Dashboard-only Phase 2 integration.
// Pure, non-JSX, directly testable — same convention established by
// components/memo/field-derivations.ts (Investor Report integration),
// which this module imports from but never modifies (Dashboard and
// Investor Report are explicitly separate milestones).
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData } from '@/types/index'

// Roadmap M2.8 — real count of machine-evaluable kill criteria defined for
// this analysis. 0 (never a fabricated number) when the analysis predates
// the feature or none were generated.
export function deriveKillCriteriaCount(m: MemoData): number {
  return m.kill_criteria?.length ?? 0
}
