// ── Watchlist re-check — Roadmap M2.8 ────────────────────────────────────────
//
// V2 Blueprint §14: "the user is alerted on stage transitions... and
// kill-criteria triggers." Re-pulls only the FAST TIER (Blueprint §4 stage
// 1: "Keepa, DataForSEO time series, cached science/trademark data —
// sub-10s") for each active watch — never the slow tier (Apify reviews,
// TikTok, Meta Ads), which is real cost/latency this scheduled job has no
// reason to spend on every watched niche every week. Google Trends is
// included alongside Keepa/Science since it's free and already the
// concordance matrix's real search_intent read (DataForSEO's own paid time
// series is not re-pulled here — a disclosed scope reduction, not a claim
// of full fast-tier fidelity).
//
// Reuses existing, already-shipped, already-tested functions end to end:
// computeDemand (lib/scoring.ts), computeConcordanceMatrix (lib/concordance.ts),
// computeLifecycle (lib/lifecycle.ts), evaluateKillCriterion (lib/kill-
// criteria.ts) — nothing here re-derives lifecycle-classification logic,
// it only supplies fresh real inputs to the exact same functions the
// original analysis used.
//
// Deliberately does NOT recompute a full market_verdict: Entry Economics
// and Differentiation Opening (lib/verdict-matrix.ts's other two pillars)
// need profitability/consumer-pain data the fast tier doesn't have. Only
// the lifecycle stage — the thing Blueprint §14 explicitly says triggers
// an alert — is re-derived and compared; the watch's recorded verdict
// stays whatever the original full analysis produced.
//
// Roadmap M3.5 (TikTok Shop Intelligence) — DISCLOSED, DELIBERATE EXCEPTION
// to the "never the slow tier... on every watched niche every week" policy
// above: a single Apify tiktok-shop-search-scraper call per rechecked niche
// is additionally made below, specifically to accumulate real weekly
// `niche_timeseries` history for lib/signal-engine/providers/
// tiktok-shop.ts's Social Commerce Calibration Gate (its header comment,
// requirement (i)) — that gate cannot ever clear without this real,
// repeated observation history existing somewhere, and this weekly
// recheck is the only cadence in this codebase that could produce it.
// Called directly against the provider class (bypassing fastTierEngine and
// SignalEngine.aggregate() entirely) and is fully non-fatal — a failure
// here never affects fastTierEngine's own watchesChecked/watchesFailed
// accounting above.

import { SignalEngine } from '@/lib/signal-engine/engine'
import { KeepaProvider } from '@/lib/signal-engine/providers/keepa'
import { GoogleTrendsProvider } from '@/lib/signal-engine/providers/google-trends'
import { ScienceProvider } from '@/lib/signal-engine/providers/science'
import { TikTokShopProvider } from '@/lib/signal-engine/providers/tiktok-shop'
import type { AggregatedSignals } from '@/lib/signal-engine/types'
import { computeDemand } from '@/lib/scoring'
import type { GroundedScore } from '@/lib/scoring'
import { computeConcordanceMatrix } from '@/lib/concordance'
import { computeLifecycle } from '@/lib/lifecycle'
import type { LifecycleClassification, GapVelocity, LifecycleStage } from '@/lib/lifecycle'
import { evaluateKillCriterion } from '@/lib/kill-criteria'
import type { KillCriterionFreshValues } from '@/lib/kill-criteria'
import type { MemoData } from '@/types/index'
import type { WatchlistEntry } from './types'
import { listActiveWatches, updateWatchAfterCheck, writeAlert } from './service-store'
import { appendObservations } from '@/lib/niche-timeseries/store'

const fastTierEngine = new SignalEngine([new KeepaProvider(), new GoogleTrendsProvider(), new ScienceProvider()])
const tiktokShopProvider = new TikTokShopProvider()

// Roadmap M3.5: real TikTok Shop GMV snapshot for one rechecked niche,
// written as `niche_timeseries` observations tagged `source: 'tiktok-shop'`
// via the SAME existing write function (appendObservations) M2.11's Keepa
// snapshot already uses below — no new writer, no schema change.
// Non-fatal by construction: TikTokShopProvider.fetch() already resolves
// null (never throws) on any real error, and this function itself never
// throws either, so a caller never needs its own try/catch around this.
async function writeTikTokShopSnapshot(nicheKey: string, categoryId: string): Promise<void> {
  try {
    const signals = await tiktokShopProvider.fetch({ query: nicheKey, categoryId })
    const sc = signals?.social_commerce
    if (!sc) return   // honest no-op: disabled provider, thin result, or a real fetch error — never a fabricated 0

    await appendObservations([
      { nicheKey, source: 'tiktok-shop', metric: 'estimated_gmv_total', value: sc.estimated_gmv_total },
      { nicheKey, source: 'tiktok-shop', metric: 'sold_count_total',    value: sc.sold_count_total },
    ])
  } catch (e: unknown) {
    console.error('watchlist recheck: tiktok-shop snapshot failed (non-fatal)', { nicheKey, error: e instanceof Error ? e.message : e })
  }
}

export async function fetchFastTierSignals(query: string, categoryId: string): Promise<AggregatedSignals | null> {
  return fastTierEngine.fetch({ query, categoryId }, 12_000)
}

// Pure: real fresh signals in, real fresh lifecycle classification out.
// Reuses computeDemand's own existing growth-signal fallback (no
// keyword_intelligence in this lightweight memo — computeDemand already
// falls back to se.growth.value.score when no DataForSEO keyword data is
// present, exactly the real path this re-check exercises).
export function computeFreshLifecycleFromSignals(
  signals: AggregatedSignals,
): { classification: LifecycleClassification; gapVelocity: GapVelocity } {
  const lightMemo = { signal_evidence: signals } as unknown as MemoData
  const demand = computeDemand(lightMemo)
  lightMemo.concordance_matrix = computeConcordanceMatrix(signals) ?? undefined

  const lightGrounded: GroundedScore = {
    score: 0, decision: 'SKIP',
    dimensions: demand.rawScore !== null
      ? [{ key: 'demand', label: 'Demand', weight: 1, rawScore: demand.rawScore, source: 'verified', sourceLabel: demand.sourceLabel }]
      : [],
    groundedPct: 100, insufficientEvidence: false,
    evidenceBreadth: { contributingProviders: [], totalScoreEligibleProviders: 0, pct: 0, channelBreakdown: [], distinctChannelTypes: 0, crossChannelCorroborated: false },
  }

  return computeLifecycle(lightMemo, lightGrounded)
}

export interface RecheckResult {
  freshStage:       LifecycleStage | null
  stageTransition:  { from: LifecycleStage; to: LifecycleStage } | null
  triggeredCriteria: WatchlistEntry['kill_criteria']
}

// Pure: given a watch entry and its fresh classification/gap-velocity
// (already computed above), decide what changed. A watch with no prior
// recorded stage (its very first re-check) can never show a "transition" —
// there is nothing real to compare against yet.
export function evaluateWatch(
  entry: WatchlistEntry,
  fresh: { classification: LifecycleClassification; gapVelocity: GapVelocity },
): RecheckResult {
  const freshStage = fresh.classification.stage
  const priorStage = entry.last_lifecycle_stage ?? entry.lifecycle_stage_at_watch

  const stageTransition = priorStage && priorStage !== freshStage
    ? { from: priorStage, to: freshStage }
    : null

  const freshValues: KillCriterionFreshValues = {
    gap_velocity: fresh.gapVelocity.value,
    search_momentum: fresh.classification.inputs.search_momentum,
    supply_young_listing_pct_24m: fresh.classification.inputs.supply_young_listing_pct_24m,
    lifecycle_stage: freshStage,
  }
  const triggeredCriteria = entry.kill_criteria.filter(c => evaluateKillCriterion(c, freshValues))

  return { freshStage, stageTransition, triggeredCriteria }
}

export interface WatchlistRecheckSummary {
  watchesChecked:    number
  watchesFailed:     number
  stageTransitions:  number
  killCriteriaAlerts: number
}

export async function runWatchlistRecheck(): Promise<WatchlistRecheckSummary> {
  const watches = await listActiveWatches()
  const summary: WatchlistRecheckSummary = { watchesChecked: 0, watchesFailed: 0, stageTransitions: 0, killCriteriaAlerts: 0 }

  for (const entry of watches) {
    const signals = await fetchFastTierSignals(entry.category_name, entry.category_id)
    if (!signals) {
      summary.watchesFailed++
      continue
    }

    const fresh = computeFreshLifecycleFromSignals(signals)
    const result = evaluateWatch(entry, fresh)

    // Roadmap M2.11: append these same real, already-computed numeric
    // values into the niche_timeseries history — non-fatal, never blocks
    // this job. search_momentum/supply_entry_velocity are categorical
    // (Momentum | 'Unknown'), not numeric, so they're deliberately not
    // appended here — only genuinely numeric fields, no invented encoding.
    await appendObservations([
      fresh.gapVelocity.demand_acceleration_pct != null
        ? { nicheKey: entry.category_name, source: 'keepa', metric: 'demand_acceleration_pct', value: fresh.gapVelocity.demand_acceleration_pct } : null,
      fresh.classification.inputs.supply_young_listing_pct_24m != null
        ? { nicheKey: entry.category_name, source: 'keepa', metric: 'young_listing_pct_24m', value: fresh.classification.inputs.supply_young_listing_pct_24m } : null,
      fresh.gapVelocity.value != null
        ? { nicheKey: entry.category_name, source: 'lifecycle', metric: 'gap_velocity', value: fresh.gapVelocity.value } : null,
    ])

    // Roadmap M3.5: additive TikTok Shop GMV snapshot for this same
    // rechecked niche — see writeTikTokShopSnapshot's own comment and this
    // file's header for why this is a disclosed exception to the
    // fast-tier-only policy above. Fully independent of, and never blocks,
    // the primary fast-tier re-check outcome computed above.
    await writeTikTokShopSnapshot(entry.category_name, entry.category_id)

    if (result.stageTransition) {
      summary.stageTransitions++
      await writeAlert({
        watchlistId: entry.id, userId: entry.user_id, alertType: 'stage_transition',
        previousStage: result.stageTransition.from, newStage: result.stageTransition.to,
      })
    }
    for (const criterion of result.triggeredCriteria) {
      summary.killCriteriaAlerts++
      await writeAlert({
        watchlistId: entry.id, userId: entry.user_id, alertType: 'kill_criteria_triggered',
        killCriterionKey: criterion.key, killCriterionLabel: criterion.label,
      })
    }

    await updateWatchAfterCheck(entry.id, result.freshStage)
    summary.watchesChecked++
  }

  return summary
}
