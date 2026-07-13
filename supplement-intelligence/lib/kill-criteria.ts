// ── Kill Criteria — Roadmap M2.8 ─────────────────────────────────────────────
//
// V2 Blueprint §13 item 8: "'what would change our mind': 3-4 falsifiable
// conditions... This separates an intelligence memo from content marketing
// and wires each report into the monitoring loop." Roadmap acceptance
// criterion: "Kill criteria are machine-evaluable (each maps to a signal +
// threshold, not prose)."
//
// Every criterion here is derived from real inputs already computed by
// Roadmap M2.2 (lib/lifecycle.ts's LifecycleClassification/GapVelocity) —
// no new fetch, no AI call, no invented number. Thresholds reuse the exact
// same disclosed judgment-call values the lifecycle classifier itself
// already uses (e.g. the Contested-stage young-listing-share threshold),
// rather than inventing new ones for this milestone.

import type { LifecycleClassification, GapVelocity, LifecycleStage } from '@/lib/lifecycle'

export type KillCriterionComparator = 'lt' | 'gt' | 'eq' | 'in'

export interface KillCriterion {
  key:      string
  label:    string   // human-readable statement of the falsifiable condition
  metric:   'gap_velocity' | 'search_momentum' | 'supply_young_listing_pct_24m' | 'lifecycle_stage'
  comparator: KillCriterionComparator
  threshold: number | string | string[]
  // The real value this metric had when the criterion was generated — for
  // audit ("was this already close to triggering at generation time").
  valueAtGeneration: number | string | null
}

// Real values a later re-check pulls fresh (lib/watchlist/recheck.ts) — same
// shape as the metrics above, one optional field per metric so a re-check
// missing one real input (e.g. no fresh search-momentum read) simply can't
// evaluate that one criterion, rather than fabricating a value for it.
export interface KillCriterionFreshValues {
  gap_velocity?: number | null
  search_momentum?: string
  supply_young_listing_pct_24m?: number | null
  lifecycle_stage?: LifecycleStage
}

// Disclosed judgment-call threshold reused verbatim from lib/lifecycle.ts's
// own Contested-stage rule (classifyLifecycleStage: `youngPct24m > 0.4`) —
// not a new number invented for this milestone.
const SUPPLY_SURGE_THRESHOLD = 0.4

// Always up to 4, in a fixed, disclosed priority order; a criterion is
// omitted (not fabricated) when its real underlying input was never
// computed for this analysis (e.g. no DataForSEO/Google Trends read, so no
// real search_momentum exists to build a criterion from).
export function computeKillCriteria(
  classification: LifecycleClassification,
  gapVelocity: GapVelocity,
): KillCriterion[] {
  const criteria: KillCriterion[] = []

  if (gapVelocity.value !== null) {
    criteria.push({
      key: 'gap_velocity_negative',
      label: 'Gap velocity turns negative (supply is catching up to demand faster than demand itself is growing)',
      metric: 'gap_velocity', comparator: 'lt', threshold: 0,
      valueAtGeneration: gapVelocity.value,
    })
  }

  if (classification.inputs.search_momentum !== 'Unknown') {
    criteria.push({
      key: 'search_decelerating',
      label: 'Search demand momentum turns Decelerating',
      metric: 'search_momentum', comparator: 'eq', threshold: 'Decelerating',
      valueAtGeneration: classification.inputs.search_momentum,
    })
  }

  if (classification.inputs.supply_young_listing_pct_24m !== null) {
    criteria.push({
      key: 'supply_velocity_surge',
      label: `New-listing share of the competitive set (last 24mo) exceeds ${Math.round(SUPPLY_SURGE_THRESHOLD * 100)}% (the same threshold the Contested-stage classification itself uses)`,
      metric: 'supply_young_listing_pct_24m', comparator: 'gt', threshold: SUPPLY_SURGE_THRESHOLD,
      valueAtGeneration: classification.inputs.supply_young_listing_pct_24m,
    })
  }

  // Always includable — classification.stage is always a real, computed value.
  criteria.push({
    key: 'lifecycle_stage_advanced',
    label: 'Lifecycle stage advances into Saturated or Declining',
    metric: 'lifecycle_stage', comparator: 'in', threshold: ['Saturated', 'Declining'],
    valueAtGeneration: classification.stage,
  })

  return criteria.slice(0, 4)
}

// Pure, deterministic evaluation — true only when the fresh value for this
// criterion's metric is both present (a later re-check actually measured
// it) and real-comparison-true against the stored threshold. A criterion
// whose fresh metric is missing this run evaluates false (not triggered),
// never assumed true or false by guessing.
export function evaluateKillCriterion(criterion: KillCriterion, fresh: KillCriterionFreshValues): boolean {
  switch (criterion.metric) {
    case 'gap_velocity': {
      const v = fresh.gap_velocity
      return typeof v === 'number' && criterion.comparator === 'lt' && v < (criterion.threshold as number)
    }
    case 'search_momentum': {
      const v = fresh.search_momentum
      return typeof v === 'string' && criterion.comparator === 'eq' && v === criterion.threshold
    }
    case 'supply_young_listing_pct_24m': {
      const v = fresh.supply_young_listing_pct_24m
      return typeof v === 'number' && criterion.comparator === 'gt' && v > (criterion.threshold as number)
    }
    case 'lifecycle_stage': {
      const v = fresh.lifecycle_stage
      return typeof v === 'string' && criterion.comparator === 'in' && (criterion.threshold as string[]).includes(v)
    }
    default:
      return false
  }
}
