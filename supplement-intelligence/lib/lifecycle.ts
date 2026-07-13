// ── Lifecycle Classifier v1 + Gap Velocity — Roadmap M2.2 ──────────────────
//
// Blueprint §3's six-stage signature table (docs/PRODUCT_INTELLIGENCE_V2_
// BLUEPRINT.md), quoted for reference:
//
// | Stage       | Science | Search        | Social/Ads | Amazon demand    | Supply velocity        |
// |-------------|---------|---------------|------------|------------------|-------------------------|
// | Latent      | ↑       | flat          | quiet      | absent           | none                    |
// | Emerging    | ↑       | ↑↑ accel.     | igniting   | small/absent     | low                     |
// | Window Open | —       | ↑             | ↑          | ↑, thin moats    | rising but lagging      |
// | Contested   | —       | ↑ flattening  | peaking    | ↑↑               | ↑↑ (listings surge)     |
// | Saturated   | —       | flat          | fading     | high, flat       | high, price compression |
// | Declining   | —       | ↓             | gone       | ↓                | exits                   |
//
// HONEST GAP, disclosed rather than fabricated around: the Science column
// has no real provider yet (Roadmap M2.5 — PubMed/ClinicalTrials.gov is not
// built). Latent and Emerging are the two stages whose blueprint signature
// leans most heavily on Science (both show ↑) — this v1 classifier
// distinguishes them using only Search + Amazon-demand-level, the two real
// columns that actually differ between them (flat/absent vs. accelerating/
// small-absent). `unmeasured_dimensions` on every classification result
// names this gap explicitly so it's never silently assumed resolved.
//
// This is a genuine "signature table" (first matching rule wins), not a
// weighted score — matching the roadmap's own words: "Heuristic signature
// table mapping concordance patterns + supply velocity onto the six
// stages." Every input is real, provider-backed data already computed
// elsewhere in this codebase (M1.6 DataForSEO acceleration, M2.1 the
// concordance matrix, M2.3 supply velocity, the existing demand/virality
// dimension scores) — nothing here calls the AI layer or introduces a new
// estimate.

import type { MemoData } from '@/types/index'
import type { GroundedScore } from '@/lib/scoring'
import type { ConcordanceMatrix, Momentum } from '@/lib/concordance'

export const LIFECYCLE_MODEL_VERSION = 'heuristic-v1'

export type LifecycleStage = 'Latent' | 'Emerging' | 'Window Open' | 'Contested' | 'Saturated' | 'Declining'

type Level = 'High' | 'Medium' | 'Low' | 'Absent'

export interface LifecycleClassification {
  stage:   LifecycleStage
  version: typeof LIFECYCLE_MODEL_VERSION
  // Every real input the classifier read, so the stage is auditable
  // against the actual evidence that produced it (roadmap acceptance
  // criterion: "with the inputs that produced it").
  inputs: {
    search_momentum:         Momentum | 'Unknown'
    amazon_demand_momentum:  Momentum | 'Unknown'
    amazon_demand_level:     Level
    social_level:            Level
    supply_entry_velocity:   'Accelerating' | 'Stable' | 'Decelerating' | 'Unknown'
    supply_young_listing_pct_24m: number | null
  }
  unmeasured_dimensions: string[]
}

export interface GapVelocity {
  value: number | null
  // Real Keepa 90-day % change in monthlySold (lib/signal-engine/types.ts
  // GrowthSignal.momentum_90d_pct) — an existing, already-used numeric
  // acceleration figure, not new estimation.
  demand_acceleration_pct: number | null
  // Derived from M2.3's entry_velocity_ratio, normalized onto a comparable
  // percentage scale: (ratio − 0.5) × 200, so 0.5 (uniform entry rate) → 0%,
  // 1.0 → +100%, 0 → −100%. This is a deliberate normalization, not a claim
  // that new-listing-share ratio and search-volume-% change are the same
  // physical unit — disclosed here rather than silently presented as
  // directly comparable.
  supply_acceleration_normalized_pct: number | null
  version: typeof LIFECYCLE_MODEL_VERSION
}

function bucketLevel(score: number | null | undefined): Level {
  if (score === null || score === undefined) return 'Absent'
  if (score >= 7) return 'High'
  if (score >= 4) return 'Medium'
  if (score >= 1) return 'Low'
  return 'Absent'
}

function momentumOf(matrix: ConcordanceMatrix | null | undefined, channel: 'search_intent' | 'amazon_market'): Momentum | 'Unknown' {
  const read = matrix?.reads.find(r => r.channel === channel)
  return read?.momentum ?? 'Unknown'
}

// ── The signature table itself ─────────────────────────────────────────
// First matching rule wins, checked in this order. See file header for the
// blueprint table each rule approximates and which columns are real vs.
// unmeasured (Science, everywhere).
export function classifyLifecycleStage(inputs: LifecycleClassification['inputs']): LifecycleStage {
  const { search_momentum: search, amazon_demand_momentum: amazonMomentum, amazon_demand_level: amazonLevel, supply_entry_velocity: supplyVel, supply_young_listing_pct_24m: youngPct24m } = inputs

  // Declining: both real demand channels falling. (Search ↓ / Amazon ↓)
  if (search === 'Decelerating' && amazonMomentum === 'Decelerating') return 'Declining'

  // Saturated: real demand is high, nothing is accelerating anymore, and
  // the competitive set isn't being refreshed with new entrants (an old,
  // settled field — no supply surge to reopen it). (flat / high, flat)
  if (amazonLevel === 'High' && search !== 'Accelerating' && amazonMomentum !== 'Accelerating' && supplyVel !== 'Accelerating') {
    return 'Saturated'
  }

  // Contested: demand AND new-entrant supply both accelerating together —
  // everyone sees the same opening at once. (↑↑ / ↑↑ listings surge)
  if (amazonMomentum === 'Accelerating' && supplyVel === 'Accelerating' && youngPct24m !== null && youngPct24m > 0.4) {
    return 'Contested'
  }

  // Window Open: demand rising on both search and Amazon, but new-entrant
  // supply hasn't caught up yet — thin moats, the actual entry moment.
  if (search === 'Accelerating' && amazonMomentum === 'Accelerating' && supplyVel !== 'Accelerating') {
    return 'Window Open'
  }

  // Emerging: search demand forming ahead of any real Amazon-side presence,
  // and supply hasn't arrived either — demand ahead of supply.
  if (search === 'Accelerating' && (amazonLevel === 'Low' || amazonLevel === 'Absent') && supplyVel !== 'Accelerating') {
    return 'Emerging'
  }

  // Latent: no real demand signal anywhere yet, nothing accelerating.
  if (amazonLevel === 'Absent' && search !== 'Accelerating') return 'Latent'

  // Fallback for a genuinely ambiguous signature (every real analysis must
  // emit a stage — never null): the most conservative real read available.
  // Real, non-absent demand with no clean signature match defaults to
  // Saturated (a mature-market read, not an optimistic one); no real
  // demand at all defaults to Latent.
  return (amazonLevel === 'High' || amazonLevel === 'Medium') ? 'Saturated' : 'Latent'
}

export function computeGapVelocity(
  demandAccelerationPct: number | null | undefined,
  supplyEntryVelocityRatio: number | null | undefined,
): GapVelocity {
  const demand = demandAccelerationPct ?? null
  const supply = supplyEntryVelocityRatio !== null && supplyEntryVelocityRatio !== undefined
    ? Math.round((supplyEntryVelocityRatio - 0.5) * 200 * 10) / 10
    : null

  return {
    value: demand !== null && supply !== null ? Math.round((demand - supply) * 10) / 10 : null,
    demand_acceleration_pct: demand,
    supply_acceleration_normalized_pct: supply,
    version: LIFECYCLE_MODEL_VERSION,
  }
}

// ── Orchestration: extract real inputs from a scored memo ──────────────
export function computeLifecycle(m: MemoData, grounded: GroundedScore): { classification: LifecycleClassification; gapVelocity: GapVelocity } {
  const matrix = m.concordance_matrix ?? null
  const demandDim = grounded.dimensions.find(d => d.key === 'demand')
  const supplyVelocity = m.signal_evidence?.supply_velocity?.value

  const inputs: LifecycleClassification['inputs'] = {
    search_momentum:        momentumOf(matrix, 'search_intent'),
    amazon_demand_momentum: momentumOf(matrix, 'amazon_market'),
    amazon_demand_level:    bucketLevel(demandDim?.rawScore),
    social_level:           bucketLevel(m.signal_evidence?.virality?.value.score),
    supply_entry_velocity:  supplyVelocity?.entry_velocity ?? 'Unknown',
    supply_young_listing_pct_24m: supplyVelocity?.young_listing_pct_24m ?? null,
  }

  const classification: LifecycleClassification = {
    stage:   classifyLifecycleStage(inputs),
    version: LIFECYCLE_MODEL_VERSION,
    inputs,
    unmeasured_dimensions: ['science'],
  }

  const gapVelocity = computeGapVelocity(
    m.signal_evidence?.growth?.value.momentum_90d_pct,
    supplyVelocity?.entry_velocity_ratio,
  )

  return { classification, gapVelocity }
}
