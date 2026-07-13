// ── Watchlist re-check schedule — real, disclosed cron cadence ─────────────
//
// Must be kept in sync with vercel.json's crons entry for
// /api/cron/watchlist-recheck ("0 10 * * 1" — every Monday, 10:00 UTC).
// There is no shared source of truth between vercel.json and application
// code today (Vercel Cron config isn't readable at runtime) — this is the
// one place to update if that schedule ever changes. A deterministic
// calculation over a real, documented constant, not a per-watch
// prediction (no per-watch "next check" timestamp is stored anywhere;
// every active watch is re-checked in the same weekly run).

export const RECHECK_CRON_HOUR_UTC = 10
export const RECHECK_CRON_WEEKDAY  = 1   // Monday (0 = Sunday, per Date.getUTCDay())

export function nextScheduledRecheck(now: Date = new Date()): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RECHECK_CRON_HOUR_UTC, 0, 0, 0))
  const currentDay = next.getUTCDay()
  let daysUntil = (RECHECK_CRON_WEEKDAY - currentDay + 7) % 7
  if (daysUntil === 0 && next.getTime() <= now.getTime()) daysUntil = 7
  next.setUTCDate(next.getUTCDate() + daysUntil)
  return next
}
