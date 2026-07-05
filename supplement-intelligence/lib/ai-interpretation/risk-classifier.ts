// ── Deterministic Primary Risk Classifier ────────────────────────────────
// Implements all 10 risk types from TECHNICAL_SPEC_V1.md §4.2.
// Classification is purely algorithmic — no AI judgment, no subjective weighting.
//
// The classifier receives a pre-computed RiskContext (assembled by builder.ts),
// evaluates all 10 risk types, and returns the highest-severity risk found.
// Tie-breaking by severity order: HIGH > MODERATE > LOW.
// Within the same severity, risks are ordered by their spec priority (index below).

import type { PrimaryRisk, RiskType, RiskSeverity, RiskEvidence } from './types'

// ── RiskContext ───────────────────────────────────────────────────────────
// Pre-computed trigger values, assembled by the builder from GroundedScore +
// MemoData. Every field the risk classifier needs is here — it never reads
// MemoData directly.

export interface RiskContext {
  // REVIEW_MOAT
  review_moat_score:            number | null
  // MARKET_SATURATION
  meaningful_competitor_count:  number | null
  avg_review_count:             number | null
  review_concentration_ratio:   number | null
  // DEMAND_UNCERTAINTY
  demand_signal_count:          number          // 0–2 (DataForSEO + Keepa)
  monthly_search_volume:        number | null
  keepa_monthly_units:          number | null
  // COST_STRUCTURE
  moq_min:                      number | null
  unit_cost_min:                number | null
  cogs_ratio:                   number | null   // unit_cost_min / median_price
  median_price:                 number | null
  // THIN_CONSUMER_DATA
  corpus_size:                  number
  thin_corpus:                  boolean
  // COMPETITOR_FORMULA_PARITY
  competitor_formula_similarity: number        // 0–1 Jaccard similarity, 0 when uncomputable
  // SEASONALITY
  seasonality_pattern:          'Perennial' | 'Seasonal' | 'Event-driven' | null
  // DEMAND_CONCENTRATION
  top_keyword_pct:              number | null   // top keyword volume / total volume
  top_keyword:                  string | null
  // VIRALITY_ABSENCE
  virality_score:               number | null   // 0–10, null when no signal
  // CATEGORY_ACCESSIBILITY
  market_accessibility_score:   number | null   // 0–10 from GroundedScore dimensions
}

// ── Risk candidate ────────────────────────────────────────────────────────

interface RiskCandidate {
  type:     RiskType
  severity: RiskSeverity
  evidence: RiskEvidence
}

const SEVERITY_RANK: Record<RiskSeverity, number> = { HIGH: 3, MODERATE: 2, LOW: 1 }

// ── Trigger evaluation for each risk type ────────────────────────────────

function evalReviewMoat(ctx: RiskContext): RiskCandidate | null {
  const score = ctx.review_moat_score
  if (score === null) return null
  // Low score = high review accumulation relative to demand = moated market
  if (score <= 3.0) {
    return {
      type: 'REVIEW_MOAT',
      severity: score <= 1.5 ? 'HIGH' : 'MODERATE',
      evidence: {
        review_moat_score:           score,
        avg_review_count:            ctx.avg_review_count ?? undefined,
        meaningful_competitor_count: ctx.meaningful_competitor_count ?? undefined,
      },
    }
  }
  return null
}

function evalMarketSaturation(ctx: RiskContext): RiskCandidate | null {
  const competitors = ctx.meaningful_competitor_count
  const concentration = ctx.review_concentration_ratio
  if (competitors === null) return null

  const heavilySaturated = competitors >= 20 && (concentration ?? 0) >= 0.70
  const saturated        = competitors >= 15 || (concentration ?? 0) >= 0.60

  if (heavilySaturated) {
    return {
      type: 'MARKET_SATURATION',
      severity: 'HIGH',
      evidence: {
        meaningful_competitor_count: competitors,
        review_concentration_ratio:  concentration ?? undefined,
        avg_review_count:            ctx.avg_review_count ?? undefined,
      },
    }
  }
  if (saturated) {
    return {
      type: 'MARKET_SATURATION',
      severity: 'MODERATE',
      evidence: {
        meaningful_competitor_count: competitors,
        review_concentration_ratio:  concentration ?? undefined,
      },
    }
  }
  return null
}

function evalDemandUncertainty(ctx: RiskContext): RiskCandidate | null {
  if (ctx.demand_signal_count >= 2) return null   // two confirmed sources — not uncertain
  if (ctx.demand_signal_count === 0) {
    return {
      type: 'DEMAND_UNCERTAINTY',
      severity: 'HIGH',
      evidence: { demand_signal_count: 0 },
    }
  }
  // Single source — moderate uncertainty
  return {
    type: 'DEMAND_UNCERTAINTY',
    severity: 'MODERATE',
    evidence: { demand_signal_count: 1, monthly_search_volume: ctx.monthly_search_volume ?? undefined },
  }
}

function evalCostStructure(ctx: RiskContext): RiskCandidate | null {
  const ratio = ctx.cogs_ratio
  if (ratio === null) return null
  if (ratio >= 0.60) {
    return {
      type: 'COST_STRUCTURE',
      severity: 'HIGH',
      evidence: {
        cogs_ratio:    ratio,
        unit_cost_min: ctx.unit_cost_min ?? undefined,
        median_price:  ctx.median_price ?? undefined,
        moq_min:       ctx.moq_min ?? undefined,
      },
    }
  }
  if (ratio >= 0.45) {
    return {
      type: 'COST_STRUCTURE',
      severity: 'MODERATE',
      evidence: {
        cogs_ratio:    ratio,
        unit_cost_min: ctx.unit_cost_min ?? undefined,
        median_price:  ctx.median_price ?? undefined,
      },
    }
  }
  return null
}

function evalThinConsumerData(ctx: RiskContext): RiskCandidate | null {
  if (!ctx.thin_corpus) return null
  return {
    type: 'THIN_CONSUMER_DATA',
    severity: ctx.corpus_size === 0 ? 'HIGH' : 'MODERATE',
    evidence: { corpus_size: ctx.corpus_size },
  }
}

function evalCompetitorFormulaParity(ctx: RiskContext): RiskCandidate | null {
  const sim = ctx.competitor_formula_similarity
  if (sim < 0.70) return null
  return {
    type: 'COMPETITOR_FORMULA_PARITY',
    severity: sim >= 0.85 ? 'HIGH' : 'MODERATE',
    evidence: { competitor_formula_similarity: sim },
  }
}

function evalSeasonality(ctx: RiskContext): RiskCandidate | null {
  if (ctx.seasonality_pattern !== 'Seasonal' && ctx.seasonality_pattern !== 'Event-driven') return null
  return {
    type: 'SEASONALITY',
    severity: ctx.seasonality_pattern === 'Event-driven' ? 'HIGH' : 'MODERATE',
    evidence: { trend_direction: ctx.seasonality_pattern },
  }
}

function evalDemandConcentration(ctx: RiskContext): RiskCandidate | null {
  const pct = ctx.top_keyword_pct
  if (pct === null) return null
  if (pct >= 0.70) {
    return {
      type: 'DEMAND_CONCENTRATION',
      severity: pct >= 0.85 ? 'HIGH' : 'MODERATE',
      evidence: {
        top_keyword_pct: pct,
        top_keyword:     ctx.top_keyword ?? undefined,
      },
    }
  }
  return null
}

function evalViralityAbsence(ctx: RiskContext): RiskCandidate | null {
  // Only fires when virality was checked (signal present in provider) but scored low.
  // If virality was never checked (null), this risk is INSUFFICIENT_DATA, not ABSENCE.
  if (ctx.virality_score === null) return null
  if (ctx.virality_score >= 4.0) return null   // adequate virality potential
  return {
    type: 'VIRALITY_ABSENCE',
    severity: ctx.virality_score <= 2.0 ? 'HIGH' : 'MODERATE',
    evidence: {},
  }
}

function evalCategoryAccessibility(ctx: RiskContext): RiskCandidate | null {
  const score = ctx.market_accessibility_score
  if (score === null) return null
  if (score <= 3.0) {
    return {
      type: 'CATEGORY_ACCESSIBILITY',
      severity: score <= 1.5 ? 'HIGH' : 'MODERATE',
      evidence: { market_accessibility_score: score },
    }
  }
  return null
}

// ── Priority ordering for tie-breaking within same severity ───────────────
// Order matches spec §4.2 risk list (highest structural concern first).

const EVALUATORS: Array<(ctx: RiskContext) => RiskCandidate | null> = [
  evalReviewMoat,
  evalMarketSaturation,
  evalDemandUncertainty,
  evalCostStructure,
  evalThinConsumerData,
  evalCompetitorFormulaParity,
  evalSeasonality,
  evalDemandConcentration,
  evalViralityAbsence,
  evalCategoryAccessibility,
]

// ── Public API ────────────────────────────────────────────────────────────

export function classifyPrimaryRisk(ctx: RiskContext): PrimaryRisk {
  const candidates = EVALUATORS
    .map(fn => fn(ctx))
    .filter((c): c is RiskCandidate => c !== null)

  if (candidates.length === 0) {
    // No risk triggered — return the default LOW risk with most relevant evidence.
    // By spec §4.2, DEMAND_UNCERTAINTY is always computable and always the
    // default fallback when no structural risk fires.
    return {
      type:     'DEMAND_UNCERTAINTY',
      severity: 'LOW',
      evidence: { demand_signal_count: ctx.demand_signal_count },
    }
  }

  // Pick the highest-severity candidate; within same severity, first in priority list wins.
  return candidates.reduce((best, c) =>
    SEVERITY_RANK[c.severity] > SEVERITY_RANK[best.severity] ? c : best,
  )
}

// ── Competitor formula similarity computation ─────────────────────────────
// Jaccard similarity across tokenized ingredient labels.
// Used by the builder to populate RiskContext.competitor_formula_similarity.
// Returns 0 when fewer than 2 competitors have ingredient labels.

export function computeCompetitorFormulaSimilarity(
  competitors: Array<{ ingredients_label?: string }>,
): number {
  const withIngredients = competitors.filter(c => c.ingredients_label && c.ingredients_label.trim().length > 0)
  if (withIngredients.length < 2) return 0

  const tokenize = (label: string): Set<string> => {
    const tokens = label
      .toLowerCase()
      .split(/[,;|+\n()\[\]\/]/)
      .map(segment => segment.trim())
      .filter(s => s.length > 2)
      .map(s => s.split(/\s+/)[0])   // first word of each ingredient segment
      .filter(t => t.length > 2)
    return new Set(tokens)
  }

  const sets = withIngredients.map(c => tokenize(c.ingredients_label!))

  let totalSim = 0
  let pairs = 0
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const a = sets[i]
      const b = sets[j]
      let intersectionSize = 0
      Array.from(a).forEach(token => {
        if (b.has(token)) intersectionSize++
      })
      const unionSize = a.size + b.size - intersectionSize
      if (unionSize > 0) {
        totalSim += intersectionSize / unionSize
        pairs++
      }
    }
  }

  return pairs > 0 ? Math.round((totalSim / pairs) * 100) / 100 : 0
}
