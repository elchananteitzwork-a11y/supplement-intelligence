// ═══════════════════════════════════════════════════════════════════════
// components/leaderboard/derivations.ts — Track Record-only Phase 3 UI
// integration. Pure, non-JSX, directly testable — same convention as
// components/dashboard/derivations.ts (Dashboard-only, not imported here:
// this milestone is scoped to Track Record and must not couple to
// Dashboard's own files).
// ═══════════════════════════════════════════════════════════════════════

import { daysSince, CHECKPOINT_DAYS } from '@/lib/re-measurement/checkpoints'

// "Clearly separate current verdict from historical outcome": the real
// M2.9 outcome_label/checkpoint data (verdict_ledger_outcomes) has no RLS
// read policy for authenticated users today — a deliberate, documented
// backend decision (migration 024_verdict_ledger_outcomes.sql: "not
// user-facing yet ... Roadmap M3.1 is its future consumer"), not
// something this milestone adds a new read path for. What IS real and
// derivable is whether enough time has elapsed for a first checkpoint to
// even be possible — reusing the exact same threshold
// (CHECKPOINT_DAYS[3] = 90 days) and elapsed-day calculation
// (daysSince()) the M2.9 worker itself uses, never a second approximation.
export type HistoricalOutcomeMaturity = 'too_early' | 'checkpoint_due'

export interface HistoricalOutcomeStatus {
  maturity:         HistoricalOutcomeMaturity
  daysSinceVerdict: number
}

export function deriveHistoricalOutcomeStatus(createdAt: string, now: Date = new Date()): HistoricalOutcomeStatus {
  const elapsed = daysSince(createdAt, now)
  return {
    maturity: elapsed >= CHECKPOINT_DAYS[3] ? 'checkpoint_due' : 'too_early',
    daysSinceVerdict: elapsed,
  }
}
