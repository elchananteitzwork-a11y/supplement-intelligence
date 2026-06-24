import type { MemoData, BuildDecision } from '@/types/index'

// ── Grounded Opportunity Score ──────────────────────────────────────────────
//
// Replaces the old formula (components/MemoDisplay.tsx, pre-2026-06-24):
//   (demand + virality + subscription + manufacturing + defensibility) / 50
// — five LLM-self-assigned 0-10 numbers, none server-verified against the
// real signal_evidence/consumer_intelligence sitting in the same memo.
//
// This version: every dimension that has a real, deterministically-computed
// provider score (Keepa/Apify/DataForSEO/TikTok, all already 0-10 via
// SignalScore) uses THAT score directly instead of the model's own number.
// Dimensions with no real provider (subscription, manufacturing,
// defensibility) stay LLM-estimated — clearly marked as such, not hidden.
// Revenue and Consumer Pain are NEW dimensions with no LLM equivalent at
// all — included only when real data exists, never backfilled with a guess.
//
// Weights are a documented, reasoned starting point, NOT empirically
// calibrated against outcomes (no outcome data exists yet to calibrate
// against — that's a real follow-up, out of scope for this fix). When a
// dimension is missing, its weight is redistributed proportionally across
// whatever IS present, so a memo with thin data isn't scored on a tiny base.

export type ScoreSource = 'verified' | 'estimated'

export interface ScoreDimension {
  key:         string
  label:       string
  weight:      number   // normalized 0-1, after redistribution for missing dims
  rawScore:    number   // 0-10
  source:      ScoreSource
  sourceLabel: string   // human-readable: which provider, or why it's an estimate
}

export interface GroundedScore {
  score:       number   // 0-100
  decision:    BuildDecision
  dimensions:  ScoreDimension[]
  groundedPct: number   // 0-100 — % of total weight backed by real evidence
}

const BASE_WEIGHTS = {
  demand:        20,
  revenue:       15,
  competition:   15,
  consumerPain:  15,
  virality:      10,
  subscription:   8,
  manufacturing:  8,
  defensibility:  9,
} // sums to 100

function marketSaturationFallbackScore(m: MemoData): number | null {
  const difficulty = m.market_saturation?.entry_difficulty
  if (difficulty === 'Low')    return 8
  if (difficulty === 'Medium') return 5
  if (difficulty === 'High')   return 2
  return null
}

// Real-data-only — no LLM equivalent exists for "consumer pain" as a number
// anywhere in this codebase, so there is nothing to fall back to. Rewards
// BOTH richness (how many distinct, real, threshold-passing themes were
// found) and severity (how negative the real sentiment split is), scaled
// down by the report's own confidence so a thin review sample can't produce
// a falsely strong signal.
function consumerPainScore(m: MemoData): number | null {
  const ci = m.consumer_intelligence
  if (!ci) return null
  const richness = Math.min(10, (ci.negativeThemes.length + ci.featureRequests.length) * 1.5)
  const severity = Math.min(10, (ci.sentimentBreakdown.negativePct / 30) * 10)
  const raw = richness * 0.6 + severity * 0.4
  return Math.round(Math.min(10, raw) * ci.confidence)
}

export function computeGroundedScore(m: MemoData): GroundedScore {
  const se = m.signal_evidence
  const candidates: ScoreDimension[] = []

  if (se?.demand) {
    candidates.push({ key: 'demand', label: 'Demand', weight: BASE_WEIGHTS.demand, rawScore: se.demand.value.score, source: 'verified', sourceLabel: se.demand.primarySource })
  } else if (se?.growth) {
    candidates.push({ key: 'demand', label: 'Demand (growth proxy)', weight: BASE_WEIGHTS.demand, rawScore: se.growth.value.score, source: 'verified', sourceLabel: se.growth.primarySource })
  } else {
    candidates.push({ key: 'demand', label: 'Demand', weight: BASE_WEIGHTS.demand, rawScore: m.scores.demand?.score ?? 5, source: 'estimated', sourceLabel: 'AI estimate — no real demand signal was available' })
  }

  if (se?.revenue) {
    candidates.push({ key: 'revenue', label: 'Revenue', weight: BASE_WEIGHTS.revenue, rawScore: se.revenue.value.score, source: 'verified', sourceLabel: se.revenue.primarySource })
  }
  // No LLM fallback for revenue — excluded entirely when no real data exists,
  // rather than letting the model invent a number with nothing to ground it.

  if (se?.review_velocity) {
    candidates.push({ key: 'competition', label: 'Market Accessibility', weight: BASE_WEIGHTS.competition, rawScore: se.review_velocity.value.score, source: 'verified', sourceLabel: se.review_velocity.primarySource })
  } else {
    const fallback = marketSaturationFallbackScore(m)
    if (fallback !== null) {
      candidates.push({ key: 'competition', label: 'Market Accessibility', weight: BASE_WEIGHTS.competition, rawScore: fallback, source: 'estimated', sourceLabel: 'AI estimate from qualitative market read — no real competitor data was available' })
    }
  }

  const painScore = consumerPainScore(m)
  if (painScore !== null) {
    candidates.push({ key: 'consumerPain', label: 'Consumer Pain / Opportunity', weight: BASE_WEIGHTS.consumerPain, rawScore: painScore, source: 'verified', sourceLabel: `Apify — ${m.consumer_intelligence!.totalReviewsCollected} real competitor reviews` })
  }
  // No LLM fallback — excluded when no real review data exists.

  if (se?.virality) {
    candidates.push({ key: 'virality', label: 'Virality', weight: BASE_WEIGHTS.virality, rawScore: se.virality.value.score, source: 'verified', sourceLabel: se.virality.primarySource })
  } else {
    candidates.push({ key: 'virality', label: 'Virality', weight: BASE_WEIGHTS.virality, rawScore: m.scores.virality?.score ?? 5, source: 'estimated', sourceLabel: 'AI estimate — no real social signal was available' })
  }

  // No real provider exists for any of these three today — always estimated.
  candidates.push({ key: 'subscription',  label: 'Subscription Fit',  weight: BASE_WEIGHTS.subscription,  rawScore: m.scores.subscription?.score  ?? 5, source: 'estimated', sourceLabel: 'AI estimate — no real subscription-behavior data source exists yet' })
  candidates.push({ key: 'manufacturing', label: 'Manufacturing Ease', weight: BASE_WEIGHTS.manufacturing, rawScore: m.scores.manufacturing?.score ?? 5, source: 'estimated', sourceLabel: 'AI estimate — independent of the separate Manufacturing tab lookup' })
  candidates.push({ key: 'defensibility', label: 'Defensibility',      weight: BASE_WEIGHTS.defensibility,  rawScore: m.scores.defensibility?.score ?? 5, source: 'estimated', sourceLabel: 'AI estimate — no real brand/IP data source exists yet' })

  const totalWeight = candidates.reduce((s, c) => s + c.weight, 0)
  const dimensions  = candidates.map(c => ({ ...c, weight: c.weight / totalWeight }))

  const weightedAvg = dimensions.reduce((s, d) => s + d.rawScore * d.weight, 0)   // 0-10
  const score = Math.max(0, Math.min(100, Math.round(weightedAvg * 10)))

  // Thresholds unchanged from the prior formula — recalibrating them against
  // real outcomes is a separate follow-up, not part of this fix.
  const decision: BuildDecision = score >= 65 ? 'BUILD_NOW' : score >= 50 ? 'VALIDATE_FURTHER' : 'SKIP'

  const groundedWeight = dimensions.filter(d => d.source === 'verified').reduce((s, d) => s + d.weight, 0)
  const groundedPct = Math.round(groundedWeight * 100)

  return { score, decision, dimensions, groundedPct }
}
