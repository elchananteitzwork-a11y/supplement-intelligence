// ── Re-measurement checkpoints — Roadmap M2.9 ────────────────────────────────
//
// V2 Blueprint §11/§12: "Re-measure at 3, 6, and 12 months." A ledger row's
// own real created_at is its t=0 — checkpoints are computed relative to
// THAT row's own date, never a global calendar cadence, since ledgered
// analyses land on different real dates.

export type CheckpointMonths = 3 | 6 | 12

// Real calendar-day approximations of 3/6/12 months (30/91/365-day-year
// convention) — a disclosed judgment call, same category as every other
// threshold constant in this codebase; recalibrate once real ledger
// history is long enough to use actual month boundaries meaningfully.
export const CHECKPOINT_DAYS: Record<CheckpointMonths, number> = {
  3:  90,
  6:  182,
  12: 365,
}

export function daysSince(createdAt: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86_400_000)
}

// Real, per-row logic: a checkpoint is due only when that many real days
// have actually elapsed since the ledger row's own created_at, and it
// hasn't already been recorded. On a ledger that only started 2026-07-12
// (see Roadmap M1.1's backfill note), no row will show ANY due checkpoint
// for months — that is the correct, honest behavior, not a bug.
export function dueCheckpoints(
  createdAt: string,
  now: Date,
  alreadyRecorded: CheckpointMonths[],
): CheckpointMonths[] {
  const elapsed = daysSince(createdAt, now)
  const all: CheckpointMonths[] = [3, 6, 12]
  return all.filter(cp => elapsed >= CHECKPOINT_DAYS[cp] && !alreadyRecorded.includes(cp))
}
