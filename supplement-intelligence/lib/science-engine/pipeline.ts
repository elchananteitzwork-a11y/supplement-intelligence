// ── Science pipeline — Roadmap M2.5 ──────────────────────────────────────────
//
// V2 Blueprint §5, §2 Pillar 1/4. Nightly batch orchestration: for each
// tracked ingredient, pulls real PubMed publication counts (one call per
// complete calendar year) and a real ClinicalTrials.gov registration total,
// derives a deterministic velocity/trend read, and writes the result to
// lib/provider-cache under `science:v1:{ingredient}` — the same generic,
// already-existing cache table every other provider-cache consumer uses,
// not a new parallel table. Triggered by app/api/cron/science-pipeline
// (Vercel Cron), never called from the request path.

import { cacheSet } from '@/lib/provider-cache'
import { appendObservations } from '@/lib/niche-timeseries/store'
import { fetchPublicationCountsByYear, fetchStrongestEvidenceType } from './pubmed'
import { fetchTrialRegistrationsCount, fetchTrialDesignBreakdown } from './clinicaltrials'
import { fetchMarketDoseDistribution } from './dsld'
import { fetchRegulatoryIntelligence } from '@/lib/regulatory-engine'
import { TRACKED_INGREDIENTS } from './tracked-ingredients'
import { getIngredientProfile } from '@/lib/ingredient-registry'
import { getUnfetchedQueueRows, getFetchedQueueRowsByDemand, markQueueRowFetched, getCacheExpiresAt } from './queue'
import type { ScienceSignal } from '@/lib/signal-engine/types'

export const SCIENCE_CACHE_TTL_MS = 30 * 60 * 60 * 1000  // 30h — outlives one missed nightly run, still honestly expires

// Disclosed judgment-call threshold, same convention as every other
// calibration constant in this codebase (e.g. lib/keyword-engine/
// acceleration.ts's ACCELERATION_THRESHOLD) — calibrate against real
// Verdict Ledger outcomes once available (Roadmap M3.2).
const VELOCITY_THRESHOLD_PCT = 15

export interface PublicationVelocity {
  velocity_pct: number | null
  trend:        ScienceSignal['publication_trend']
}

// Velocity is computed from the last two COMPLETE calendar years actually
// present in the record — never a fabricated comparison against a missing
// year. Returns { velocity_pct: null, trend: undefined } when fewer than
// two years of real data exist.
export function computePublicationVelocity(countsByYear: Record<string, number>): PublicationVelocity {
  const years = Object.keys(countsByYear).map(Number).sort((a, b) => a - b)
  if (years.length < 2) return { velocity_pct: null, trend: undefined }

  const latestYear = years[years.length - 1]
  const priorYear  = years[years.length - 2]
  const latest = countsByYear[String(latestYear)]
  const prior  = countsByYear[String(priorYear)]
  if (prior <= 0) return { velocity_pct: null, trend: undefined }

  const velocity_pct = Math.round(((latest - prior) / prior) * 1000) / 10
  const trend: ScienceSignal['publication_trend'] =
    velocity_pct > VELOCITY_THRESHOLD_PCT  ? 'Accelerating' :
    velocity_pct < -VELOCITY_THRESHOLD_PCT ? 'Declining' : 'Stable'

  return { velocity_pct, trend }
}

// A 0-10 SignalScore, primarily direction-driven — Blueprint §2 Pillar 1
// frames science as "an early-demand proxy" where the DIRECTION of
// publication activity carries more signal than its absolute magnitude
// (a niche can be legitimately real with 50 papers/year or 5,000). Same
// direction-first scoring philosophy as google-trends.ts's growthToScore.
function scienceScore(trend: ScienceSignal['publication_trend']): number {
  if (trend === 'Accelerating') return 8
  if (trend === 'Declining')    return 3
  if (trend === 'Stable')       return 5
  return 4   // trend unknown (< 2 years of real data) — below-neutral, not a guessed midpoint
}

export interface ScienceIngestionResult {
  ingredient: string
  success:    boolean
  reason?:    string
}

export async function ingestScienceSignal(ingredient: string, now = new Date()): Promise<ScienceIngestionResult> {
  // Roadmap M2.15: the real external-database search term now comes from
  // the ingredient registry, not the bare tracked-ingredient string
  // directly — identical value for all 3 tracked ingredients today (zero
  // behavior change), but a future ingredient whose common name and
  // external-database search term diverge has a real place to do that.
  // Falls back to the bare string for a not-yet-registered ingredient
  // (never throws, never blocks the pipeline).
  const searchTerm = getIngredientProfile(ingredient)?.canonicalSearchTerm ?? ingredient

  const [publicationCounts, trialCount, evidenceType, trialDesign, marketDose, regulatory] = await Promise.all([
    fetchPublicationCountsByYear(searchTerm, 6, now),
    fetchTrialRegistrationsCount(searchTerm),
    // Roadmap M2.16: additive, non-fatal — a failure here (null) never
    // blocks the pipeline or the existing success/failure condition below,
    // same "partial, honest signal" treatment as the two original calls.
    fetchStrongestEvidenceType(searchTerm),
    fetchTrialDesignBreakdown(searchTerm),
    // Roadmap M2.17: same additive, non-fatal treatment. Takes the raw
    // `ingredient` key (not `searchTerm`) — dsld.ts needs the full
    // registry profile (displayName/aliases/canonicalSearchTerm), not just
    // the resolved search term alone.
    fetchMarketDoseDistribution(ingredient),
    // Roadmap M2.18: reuses the existing, already-live lib/regulatory-engine
    // (real openFDA CAERS adverse events + enforcement recalls, previously
    // wired only into the on-demand research pipeline) — zero new fetch
    // logic, same additive/non-fatal treatment. Its own extractIngredient()
    // is a no-op on a bare tracked-ingredient string like "berberine".
    fetchRegulatoryIntelligence(searchTerm),
  ])

  if (publicationCounts === null && trialCount === null) {
    return { ingredient, success: false, reason: 'Both PubMed and ClinicalTrials.gov requests failed' }
  }

  const { velocity_pct, trend } = publicationCounts ? computePublicationVelocity(publicationCounts) : { velocity_pct: null, trend: undefined }

  const signal: ScienceSignal = {
    score:      scienceScore(trend),
    confidence: publicationCounts ? (Object.keys(publicationCounts).length >= 5 ? 0.75 : 0.55) : 0.4,
    ingredient,
    publication_counts_by_year: publicationCounts ?? undefined,
    publication_velocity_pct:   velocity_pct ?? undefined,
    publication_trend:          trend,
    trial_registrations_count:  trialCount ?? undefined,
    strongest_evidence_type:    evidenceType?.strongest_evidence_type,
    evidence_sample_size:       evidenceType?.evidence_sample_size,
    trial_study_types:          trialDesign?.trial_study_types,
    trial_max_phase_reached:    trialDesign?.trial_max_phase_reached,
    market_dose_mg:             marketDose?.market_dose_mg,
    market_dose_sample_size:    marketDose?.market_dose_sample_size,
    rda_range_mg:               marketDose?.rda_range_mg,
    market_dose_vs_rda:         marketDose?.market_dose_vs_rda,
    // Roadmap M2.18: the full existing RegulatoryIntelligence object,
    // unmodified — its own real disclaimer/risk_summary/warning_flags
    // travel with it unchanged, so this is never re-labeled as a
    // conclusion here (see ScienceSignal['regulatory']'s own doc comment).
    regulatory:                 regulatory ?? undefined,
    as_of: now.toISOString(),
  }

  await cacheSet(`science:v1:${ingredient}`, 'science-pipeline', signal, SCIENCE_CACHE_TTL_MS)

  // Roadmap M2.11: append a second, permanent copy of these same real
  // values into the niche_timeseries history — non-fatal, never blocks
  // this pipeline (appendObservations already filters out null/NaN).
  await appendObservations([
    velocity_pct != null ? { nicheKey: ingredient, source: 'science', metric: 'publication_velocity_pct', value: velocity_pct, observedAt: now } : null,
    trialCount != null   ? { nicheKey: ingredient, source: 'science', metric: 'trial_registrations_count', value: trialCount, observedAt: now } : null,
    // Roadmap M2.16: real evidence-sample-size and trial-design counts,
    // same non-fatal append pattern.
    evidenceType?.evidence_sample_size != null ? { nicheKey: ingredient, source: 'science', metric: 'evidence_sample_size', value: evidenceType.evidence_sample_size, observedAt: now } : null,
    trialDesign ? { nicheKey: ingredient, source: 'science', metric: 'trial_interventional_count', value: trialDesign.trial_study_types.interventional, observedAt: now } : null,
    trialDesign ? { nicheKey: ingredient, source: 'science', metric: 'trial_observational_count', value: trialDesign.trial_study_types.observational, observedAt: now } : null,
    // Roadmap M2.17: real market-dose median and sample size, same
    // non-fatal append pattern.
    marketDose?.market_dose_mg ? { nicheKey: ingredient, source: 'science', metric: 'market_dose_median_mg', value: marketDose.market_dose_mg.median, observedAt: now } : null,
    marketDose?.market_dose_sample_size != null ? { nicheKey: ingredient, source: 'science', metric: 'market_dose_sample_size', value: marketDose.market_dose_sample_size, observedAt: now } : null,
    // Roadmap M2.18: real CAERS adverse-event and recall counts — a
    // regulatory/safety SIGNAL only (see ScienceSignal['regulatory']'s doc
    // comment), same non-fatal append pattern as every other real count.
    regulatory?.adverse_events ? { nicheKey: ingredient, source: 'science', metric: 'regulatory_adverse_event_count', value: regulatory.adverse_events.total_reports, observedAt: now } : null,
    regulatory?.recalls ? { nicheKey: ingredient, source: 'science', metric: 'regulatory_recall_count', value: regulatory.recalls.total_recalls, observedAt: now } : null,
  ])

  return { ingredient, success: true }
}

export async function runScienceIngestionPipeline(now = new Date()): Promise<ScienceIngestionResult[]> {
  const results: ScienceIngestionResult[] = []
  // Sequential, not parallel — fetchPublicationCountsByYear already makes 6
  // sequential real PubMed calls per ingredient; running multiple
  // ingredients in parallel on top of that would multiply concurrent load
  // against NCBI's shared rate limit for no real benefit (this is a
  // once-nightly batch, not a latency-sensitive path).
  for (const ingredient of TRACKED_INGREDIENTS) {
    results.push(await ingestScienceSignal(ingredient, now))
  }
  return results
}

// ── Queue drain — Roadmap "Dynamic Science Coverage" ────────────────────────
//
// docs/RD_DYNAMIC_SCIENCE_COVERAGE.md (owner-approved 2026-07-28). Runs AFTER
// runScienceIngestionPipeline() above — the 3 benchmark tracked ingredients
// keep absolute priority; this phase spends a small, bounded, disclosed
// nightly budget draining the demand queue (science_ingredient_queue,
// migration 032) using the exact same per-ingredient fetch path
// (ingestScienceSignal), sequentially, never parallelized (same PubMed
// rate-limit discipline as runScienceIngestionPipeline itself).

// A stated, commented, initial value — the single knob if the ceiling ever
// needs to move (see the R&D doc's §3 step 5 and §4 Risks).
export const QUEUE_BUDGET_PER_NIGHT = 15

// Roughly 30% of SCIENCE_CACHE_TTL_MS remaining — same "stated, commented,
// initial value, not yet calibrated against real outcome data" convention as
// VELOCITY_THRESHOLD_PCT above. A queue-driven ingredient fetched once would
// otherwise silently expire and go dark again (R&D doc §4 Risks:
// "provider_cache TTL vs queue-driven entries") unless re-refreshed before
// its cache entry actually expires. Raised 0.2 → 0.3 (6h → 9h) in the
// Dynamic Detection Coverage critique round (docs/
// RD_DYNAMIC_DETECTION_COVERAGE.md): the 24h cron cadence against the 30h
// TTL leaves EXACTLY 6h to expiry at scan time — a knife-edge equality
// where minutes of Vercel cron jitter skip a whole night's re-refresh (and
// with it that night's niche_timeseries observation). 9h gives the nightly
// re-refresh real margin; still at most one refresh per night, so PubMed
// volume is unchanged.
export const QUEUE_NEAR_EXPIRY_MS = SCIENCE_CACHE_TTL_MS * 0.3   // ~9h

// Review fix: `startedAt` (passed in by the route) is captured at ROUTE
// START — BEFORE runScienceIngestionPipeline()'s tracked-3 refresh runs, not
// at the start of this drain phase. withinTimeBudget() below measures
// elapsed time from that same `startedAt`, so this constant is really a
// ceiling on TOTAL elapsed time since route start (tracked-3 refresh AND
// drain combined), not a drain-phase-only budget. Naming and value reflect
// that honestly: 45s here, leaving ~15s of real headroom before the route's
// 60s maxDuration for the Discovery/Divergence detection calls that run
// after — comparable to the R&D doc's original ~20s headroom design intent
// (tracked-3 refresh ~7s + queue drain ~32s ≈ 39s ⇒ ~20s headroom), now
// expressed as a single elapsed-since-route-start ceiling instead of a
// drain-only one. Tradeoff, intentional and disclosed: this protects the
// real 60s maxDuration ceiling directly, at the cost of occasionally
// draining fewer than QUEUE_BUDGET_PER_NIGHT ingredients on a night the
// tracked-3 refresh itself runs long — never risk the route timing out.
export const ROUTE_ELAPSED_CEILING_MS = 45 * 1000

export interface QueueDrainResult {
  drained:         string[]
  // Rows that would have qualified (unfetched, or fetched-but-near-expiry)
  // but the QUEUE_BUDGET_PER_NIGHT budget was already spent — observability
  // only, never a failure.
  skippedForBudget: number
  // True when the drain stopped early on the elapsed-time guard rather than
  // exhausting the count budget — observability only.
  timeExhausted:   boolean
}

export async function drainScienceIngredientQueue(startedAt: number, now = new Date()): Promise<QueueDrainResult> {
  const drained: string[] = []
  let skippedForBudget = 0
  let timeExhausted = false

  const withinTimeBudget = () => Date.now() - startedAt < ROUTE_ELAPSED_CEILING_MS

  // Pass 1: unfetched queue rows, oldest first_requested_at first — always
  // takes priority over pass 2's demand-weighted re-refresh below.
  const unfetched = await getUnfetchedQueueRows(QUEUE_BUDGET_PER_NIGHT * 2)
  for (const row of unfetched) {
    if (drained.length >= QUEUE_BUDGET_PER_NIGHT) { skippedForBudget++; continue }
    if (!withinTimeBudget()) { timeExhausted = true; break }
    const result = await ingestScienceSignal(row.ingredient, now)
    if (result.success) {
      await markQueueRowFetched(row.ingredient, now)
      drained.push(row.ingredient)
    }
  }

  // Pass 2: previously-fetched rows whose provider_cache entry is nearing
  // its 30h TTL expiry, most-requested first — only when pass 1 didn't
  // already spend the whole budget or the time guard.
  if (!timeExhausted && drained.length < QUEUE_BUDGET_PER_NIGHT) {
    const candidates = await getFetchedQueueRowsByDemand(QUEUE_BUDGET_PER_NIGHT * 4)
    for (const row of candidates) {
      if (drained.length >= QUEUE_BUDGET_PER_NIGHT) { skippedForBudget++; continue }
      if (!withinTimeBudget()) { timeExhausted = true; break }
      // LIVE-FOUND BUG FIX (2026-08-04, docs/RD_DYNAMIC_DETECTION_COVERAGE.md
      // validation): a null expiresAt for a FETCHED queue row means the
      // cache entry expired and was purged (lazy delete on read, or the
      // daily pruning job) — the WORST staleness case, not a skip. The old
      // `expiresAt !== null &&` guard made such rows permanently dark:
      // fetched_at set, cache gone, never re-refreshed again. Production
      // evidence: ashwagandha's nightly observations stopped 2026-08-03
      // when the re-refresh missed once (the 6h knife-edge, fixed above)
      // and its cache expired — one lazy purge away from permanent dark.
      const expiresAt = await getCacheExpiresAt(`science:v1:${row.ingredient}`)
      const nearExpiry = expiresAt === null || expiresAt.getTime() - now.getTime() <= QUEUE_NEAR_EXPIRY_MS
      if (!nearExpiry) continue   // genuinely fresh cache — real skip, not a budget/time exhaustion
      const result = await ingestScienceSignal(row.ingredient, now)
      if (result.success) {
        await markQueueRowFetched(row.ingredient, now)
        drained.push(row.ingredient)
      }
    }
  }

  return { drained, skippedForBudget, timeExhausted }
}
