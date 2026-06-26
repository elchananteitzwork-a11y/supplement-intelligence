import type { MemoData, BuildDecision } from '@/types/index'

// ── Grounded Opportunity Score ──────────────────────────────────────────────
//
// PERMANENT ENGINEERING RULE (2026-06-26): every numerical metric, score,
// probability, or confidence value must come from verified external data or
// a deterministic formula. AI may explain, summarize, and describe — it may
// never assign a number to anything. This file is where that rule is
// enforced for the headline score: a dimension contributes weight to the
// 0-100 score ONLY when it is backed by a real provider (Keepa/Apify/
// DataForSEO/TikTok) or a disclosed formula over real data (consumerPain).
//
// Dimensions with no real data source (subscription, manufacturing — no
// provider exists for either, ever; demand/virality/competition when their
// real provider didn't return data for this query) carry ZERO weight. They
// are still shown, for context, as a qualitative AI judgment ("Medium",
// never "7/10") — never converted into a number, never contributing to the
// score. This replaces the prior design, which substituted the model's own
// invented 0-10 number (or, for competition, mapped its qualitative
// entry_difficulty into a number via marketSaturationFallbackScore) whenever
// no real signal existed. Both of those were exactly the kind of
// AI-generated-number-with-no-traceable-basis this rule exists to eliminate.
//
// groundedPct is therefore now ALWAYS 100 whenever at least one dimension
// has weight — by construction, every dimension that contributes IS real.
// What varies between memos is no longer "how much of the score is real,"
// it's "how many real dimensions did we find" — see insufficientEvidence
// below for the case where the answer is zero.

export type ScoreSource = 'verified' | 'synthesized'

export interface ScoreDimension {
  key:         string
  label:       string
  weight:      number              // normalized 0-1; 0 for dimensions excluded from the score entirely
  rawScore?:   number              // 0-10 — present ONLY when backed by real data or a real-data formula
  qualitativeLevel?: 'High' | 'Medium' | 'Low'   // present instead of rawScore when no real basis exists — AI judgment, shown, never scored
  source:      ScoreSource
  sourceLabel: string              // human-readable: which provider, or why this is AI judgment with no real basis
}

export interface GroundedScore {
  score:       number   // 0-100
  decision:    BuildDecision
  dimensions:  ScoreDimension[]
  groundedPct: number   // 0 or 100 — see header comment; 0 only when insufficientEvidence
  insufficientEvidence: boolean   // true when zero dimensions have any real basis — score/decision are not meaningful, UI must say so rather than show a number that looks earned
}

const BASE_WEIGHTS = {
  demand:        23,
  revenue:       17,
  competition:   17,
  consumerPain:  17,
  virality:      10,
  subscription:   8,
  manufacturing:  8,
} // sums to 100 — only the subset with weight > 0 on a given memo is ever used; subscription/manufacturing never carry weight, see header

// Real-data-only — no LLM equivalent exists for "consumer pain" as a number
// anywhere in this codebase. Rewards BOTH richness (how many distinct, real,
// threshold-passing themes were found) and severity (how negative the real
// sentiment split is), scaled down by the report's own confidence so a thin
// review sample can't produce a falsely strong signal. Every input is real;
// this is the formula the "deterministic calculation" half of the rule
// refers to.
function consumerPainScore(m: MemoData): number | null {
  const ci = m.consumer_intelligence
  if (!ci) return null
  const richness = Math.min(10, (ci.negativeThemes.length + ci.featureRequests.length) * 1.5)
  const severity = Math.min(10, (ci.sentimentBreakdown.negativePct / 30) * 10)
  const raw = richness * 0.6 + severity * 0.4
  return Math.round(Math.min(10, raw) * ci.confidence)
}

// Backward compat only: memos generated before this redesign have a numeric
// `score` (the model's own invented 0-10) instead of `level`. That number
// already exists in stored history and can't be un-fabricated retroactively
// — bucketing it into a qualitative label for DISPLAY is the least-bad
// option (never re-enters any computation, never shown as a number again).
// New memos never populate `score` for these fields, so this path is dead
// for everything generated going forward.
function legacyScoreToLevel(score: number | undefined): 'High' | 'Medium' | 'Low' | undefined {
  if (typeof score !== 'number') return undefined
  return score >= 7 ? 'High' : score >= 4 ? 'Medium' : 'Low'
}

// A qualitative-only candidate: zero weight, no number, shown for context
// only. `level` is whatever the model wrote (or undefined on memos
// generated before this redesign, which still have a numeric `score` field
// instead — see the `legacyScore` fallback at each call site below).
function qualitative(key: string, label: string, level: 'High' | 'Medium' | 'Low' | undefined, reason: string): ScoreDimension {
  return { key, label, weight: 0, qualitativeLevel: level, source: 'synthesized', sourceLabel: reason }
}

export function computeGroundedScore(m: MemoData): GroundedScore {
  const se = m.signal_evidence
  const candidates: ScoreDimension[] = []

  // ── Demand ──
  if (se?.demand) {
    candidates.push({ key: 'demand', label: 'Demand', weight: BASE_WEIGHTS.demand, rawScore: se.demand.value.score, source: 'verified', sourceLabel: se.demand.primarySource })
  } else if (se?.growth) {
    candidates.push({ key: 'demand', label: 'Demand (growth proxy)', weight: BASE_WEIGHTS.demand, rawScore: se.growth.value.score, source: 'verified', sourceLabel: se.growth.primarySource })
  } else {
    candidates.push(qualitative('demand', 'Demand', m.scores.demand?.level ?? legacyScoreToLevel(m.scores.demand?.score), 'AI judgment — no real demand signal was available for this query'))
  }

  // ── Revenue — no qualitative fallback exists: there is no AI-written
  // revenue field in the schema at all, so there is nothing to show when
  // real data is absent. Excluded entirely, same as before this redesign.
  if (se?.revenue) {
    candidates.push({ key: 'revenue', label: 'Revenue', weight: BASE_WEIGHTS.revenue, rawScore: se.revenue.value.score, source: 'verified', sourceLabel: se.revenue.primarySource })
  }

  // ── Competition / Market Accessibility ──
  if (se?.review_velocity) {
    candidates.push({ key: 'competition', label: 'Market Accessibility', weight: BASE_WEIGHTS.competition, rawScore: se.review_velocity.value.score, source: 'verified', sourceLabel: se.review_velocity.primarySource })
  } else {
    // No more marketSaturationFallbackScore: entry_difficulty is itself an
    // AI-written qualitative label (Low/Medium/High) — mapping it to {8,5,2}
    // was converting an AI judgment into a number wearing a formula's
    // clothing. Show the label as what it is; contribute no weight.
    candidates.push(qualitative('competition', 'Market Accessibility', m.market_saturation?.entry_difficulty as 'High' | 'Medium' | 'Low' | undefined, 'AI judgment from qualitative market read — no real competitor data was available'))
  }

  // ── Consumer Pain / Opportunity — real formula over real data ──
  const painScore = consumerPainScore(m)
  if (painScore !== null) {
    candidates.push({ key: 'consumerPain', label: 'Consumer Pain / Opportunity', weight: BASE_WEIGHTS.consumerPain, rawScore: painScore, source: 'verified', sourceLabel: `Apify — ${m.consumer_intelligence!.totalReviewsCollected} real competitor reviews` })
  }
  // No qualitative fallback — excluded when no real review data exists.

  // ── Virality ──
  if (se?.virality) {
    candidates.push({ key: 'virality', label: 'Virality', weight: BASE_WEIGHTS.virality, rawScore: se.virality.value.score, source: 'verified', sourceLabel: se.virality.primarySource })
  } else {
    candidates.push(qualitative('virality', 'Virality', m.scores.virality?.level ?? legacyScoreToLevel(m.scores.virality?.score), 'AI judgment — no real social signal was available'))
  }

  // ── Subscription / Manufacturing — no real provider exists for either,
  // ever. Always qualitative, always zero weight.
  candidates.push(qualitative('subscription',  'Subscription Fit',   m.scores.subscription?.level  ?? legacyScoreToLevel(m.scores.subscription?.score),  'AI judgment — no real subscription-behavior data source exists yet'))
  candidates.push(qualitative('manufacturing', 'Manufacturing Ease', m.scores.manufacturing?.level ?? legacyScoreToLevel(m.scores.manufacturing?.score), 'AI judgment — independent of the separate Manufacturing tab lookup'))

  const totalWeight = candidates.reduce((s, c) => s + c.weight, 0)

  // Zero real dimensions found at all — there is nothing to compute a score
  // from. Returning a 0-100 number here, even "0", would look like a real
  // verdict; it isn't one. The UI must show "insufficient evidence," not a score.
  if (totalWeight === 0) {
    return {
      score: 0,
      decision: 'SKIP',
      dimensions: candidates,
      groundedPct: 0,
      insufficientEvidence: true,
    }
  }

  const dimensions = candidates.map(c => ({ ...c, weight: c.weight / totalWeight }))

  const weightedAvg = dimensions.reduce((s, d) => s + (d.rawScore ?? 0) * d.weight, 0)   // 0-10 — qualitative entries contribute 0 weight, so their missing rawScore never factors in
  const score = Math.max(0, Math.min(100, Math.round(weightedAvg * 10)))

  // Thresholds unchanged from the prior formula — recalibrating them against
  // real outcomes is a separate follow-up, not part of this redesign.
  const decision: BuildDecision = score >= 65 ? 'BUILD_NOW' : score >= 50 ? 'VALIDATE_FURTHER' : 'SKIP'

  // Always 100 here: every dimension with weight > 0 is, by construction
  // above, 'verified'. See header comment.
  const groundedPct = 100

  return { score, decision, dimensions, groundedPct, insufficientEvidence: false }
}

// ── Traction band ────────────────────────────────────────────────────────
// Replaces the model's invented ten_k_probability/hundred_k_probability/
// one_m_probability (2026-06-26 redesign — "generated to look like model
// output from a forecasting tool, but there is no statistical base-rate
// model... behind them," per the prior provenance.ts classification of
// those fields). There is still no real comparable-company dataset to
// produce a calibrated probability from — so rather than compute a number
// that would carry the same false precision, this gives a deterministic,
// disclosed qualitative band from the same real signals the main score
// already uses: how many real dimensions were found, and how strong the
// real revenue/demand signal is specifically.
export type TractionBand = 'Early-stage, unproven' | 'Some comparable traction' | 'Strong comparable traction'

export function computeTractionBand(m: MemoData): TractionBand {
  const se = m.signal_evidence
  const realRevenueScore = se?.revenue?.value.score
  const realDemandScore  = se?.demand?.value.score ?? se?.growth?.value.score
  const hasStrongReal = (typeof realRevenueScore === 'number' && realRevenueScore >= 6)
                      || (typeof realDemandScore  === 'number' && realDemandScore  >= 7)
  const hasSomeReal = !!se?.revenue || !!se?.demand || !!se?.growth || !!se?.review_velocity

  if (hasStrongReal) return 'Strong comparable traction'
  if (hasSomeReal)   return 'Some comparable traction'
  return 'Early-stage, unproven'
}
