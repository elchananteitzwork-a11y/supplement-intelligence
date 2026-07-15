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
import { TRACKED_INGREDIENTS } from './tracked-ingredients'
import { getIngredientProfile } from '@/lib/ingredient-registry'
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

  const [publicationCounts, trialCount, evidenceType, trialDesign, marketDose] = await Promise.all([
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
