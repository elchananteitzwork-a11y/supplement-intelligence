// ── Quarterly re-measurement worker — Roadmap M2.9 ───────────────────────────
//
// V2 Blueprint §11/§12. For every ledgered analysis old enough to have a due
// checkpoint (3/6/12 real months since its own created_at — see
// checkpoints.ts), re-pulls the FAST TIER ONLY and records a real outcome
// row. Reuses lib/watchlist/recheck.ts's fetchFastTierSignals verbatim
// (Roadmap M2.8's Keepa+GoogleTrends+Science engine) rather than building a
// second fast-tier fetch mechanism — this is the exact same real signal
// source, just consumed for a different real question here (market outcome
// vs. lifecycle-stage drift).
//
// Honest, disclosed limitation: the real ledger only began recording on
// 2026-07-12 (Roadmap M1.1's backfill note). As of this milestone shipping
// (2026-07-13), not a single real ledger row has reached even the 90-day
// (3-month) checkpoint — a live production run of this worker today
// correctly processes zero checkpoints. This is verified instead via
// fixture-forced elapsed-checkpoint tests (lib/re-measurement/__tests__/
// pipeline.test.ts), the same honesty convention already used for every
// other not-yet-live-verifiable integration this session (e.g. M1.5's Meta
// Ads, M2.7's Reddit pipeline).

import { fetchFastTierSignals } from '@/lib/watchlist/recheck'
import { parseDollarString } from '@/lib/scoring'
import { dueCheckpoints, daysSince } from './checkpoints'
import { computeOutcomeLabel } from './outcome'
import {
  listCandidateLedgerRows, getRecordedCheckpoints, getFrozenVerdictContext, writeOutcome,
} from './service-store'

export const RE_MEASUREMENT_VERSION = 'heuristic-v1'

// Real, already-documented per-call Keepa cost this codebase discloses
// elsewhere (.env.example: "~50 Keepa tokens per discovery call (category
// bestsellers + 10 products)") — this codebase has never plumbed Keepa's
// own live tokensLeft response field anywhere, so this is a disclosed
// estimate grounded in Keepa's real, documented per-call cost, not a
// live-metered exact count. Logged per the roadmap's own acceptance
// criterion ("~70 Keepa tokens/niche, logged").
const KEEPA_TOKENS_PER_REMEASUREMENT_ESTIMATE = 50

export interface RemeasurementResult {
  ledgerRowsCandidates:  number
  ledgerRowsProcessed:   number
  checkpointsRecorded:   number
  keepaTokensUsedEstimate: number
}

export async function runRemeasurement(now = new Date()): Promise<RemeasurementResult> {
  const rows = await listCandidateLedgerRows(now)
  const result: RemeasurementResult = {
    ledgerRowsCandidates: rows.length, ledgerRowsProcessed: 0, checkpointsRecorded: 0, keepaTokensUsedEstimate: 0,
  }

  for (const row of rows) {
    if (!row.category_id) continue   // no real category id to re-fetch signals for — never guessed

    const recorded = await getRecordedCheckpoints(row.id)
    const due = dueCheckpoints(row.created_at, now, recorded)
    if (!due.length) continue

    const signals = await fetchFastTierSignals(row.normalized_market, row.category_id)
    const frozen = await getFrozenVerdictContext(row.analysis_id)
    result.keepaTokensUsedEstimate += KEEPA_TOKENS_PER_REMEASUREMENT_ESTIMATE

    const entryVelocity = signals?.supply_velocity?.value.entry_velocity
    const youngListingPct24m = signals?.supply_velocity?.value.young_listing_pct_24m ?? null
    const avgReviewCountAtMeasurement = signals?.revenue?.value.avg_review_count ?? null
    const avgPriceAtMeasurement = signals?.pricing?.value.avg_price
      ? parseDollarString(signals.pricing.value.avg_price) : null

    const priceMovementPct = avgPriceAtMeasurement !== null
      && frozen.avgPriceAtVerdict !== null && frozen.avgPriceAtVerdict > 0
      ? Math.round(((avgPriceAtMeasurement - frozen.avgPriceAtVerdict) / frozen.avgPriceAtVerdict) * 1000) / 10
      : null

    const outcomeLabel = computeOutcomeLabel({ entryVelocity, avgReviewCountAtMeasurement })
    const elapsedDays = daysSince(row.created_at, now)

    for (const checkpoint of due) {
      await writeOutcome({
        verdictLedgerId: row.id,
        checkpointMonths: checkpoint,
        daysSinceVerdict: elapsedDays,
        entryVelocity: entryVelocity ?? null,
        youngListingPct24m,
        avgReviewCountAtMeasurement,
        avgReviewCountAtVerdict: frozen.avgReviewCountAtVerdict,
        avgPriceAtMeasurement,
        avgPriceAtVerdict: frozen.avgPriceAtVerdict,
        priceMovementPct,
        outcomeLabel,
        keepaTokensUsedEstimate: KEEPA_TOKENS_PER_REMEASUREMENT_ESTIMATE,
      })
      result.checkpointsRecorded++
    }
    result.ledgerRowsProcessed++
  }

  return result
}
