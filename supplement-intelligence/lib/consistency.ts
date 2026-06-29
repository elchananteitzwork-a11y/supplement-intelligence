import type { MemoData, BuildDecision } from '@/types/index'

// ── Server-side consistency checks ──────────────────────────────────────────
//
// Compares what the model wrote against the real signal_evidence/
// consumer_intelligence already stored on the same memo. Pure function of
// MemoData — runs once in app/api/generate/route.ts (the "server-side"
// requirement) and is re-derived identically in the UI for display, same
// pattern already used by lib/scoring.ts's computeGroundedScore.
//
// This does NOT try to parse free-text fields (market_thesis, why_now) for
// factual claims — that's unreliable to do well in scope. It checks the
// structured fields that have a real counterpart to check against: market
// concentration/entry-difficulty vs real competitor data, demand score vs
// real revenue/demand data, and a BUILD_NOW verdict vs real documented
// customer pain.

export interface ConsistencyFlag {
  field:    string   // memo field this concerns, for the UI to anchor to
  claim:    string   // what the memo says
  evidence: string   // what the real evidence says
}

export function checkConsistency(m: MemoData, decision: BuildDecision): ConsistencyFlag[] {
  const flags: ConsistencyFlag[] = []
  const rv  = m.signal_evidence?.review_velocity?.value
  const sat = m.market_saturation

  // 1. Market concentration contradiction
  if (sat && rv?.review_concentration_ratio !== undefined && rv.meaningful_competitor_count !== undefined) {
    const realConcentrated = rv.review_concentration_ratio > 0.6 || rv.meaningful_competitor_count > 15
    const realSparse       = rv.review_concentration_ratio < 0.3 && rv.meaningful_competitor_count < 5

    if ((sat.concentration === 'Low' || sat.concentration === 'Moderate') && realConcentrated) {
      flags.push({
        field:    'market_saturation.concentration',
        claim:    `Memo describes market concentration as "${sat.concentration}"`,
        evidence: `Real competitor data shows ${rv.meaningful_competitor_count} established competitors, with the top 3 holding ${Math.round(rv.review_concentration_ratio * 100)}% of reviews — that reads as more concentrated than claimed.`,
      })
    } else if ((sat.concentration === 'High' || sat.concentration === 'Very High') && realSparse) {
      flags.push({
        field:    'market_saturation.concentration',
        claim:    `Memo describes market concentration as "${sat.concentration}"`,
        evidence: `Real competitor data shows only ${rv.meaningful_competitor_count} established competitors and a top-3 share of ${Math.round(rv.review_concentration_ratio * 100)}% — that reads as less concentrated than claimed.`,
      })
    }
  }

  // 2. Entry difficulty contradiction
  if (sat?.entry_difficulty === 'Low' && rv?.meaningful_competitor_count !== undefined && rv.meaningful_competitor_count > 15) {
    flags.push({
      field:    'market_saturation.entry_difficulty',
      claim:    `Memo describes entry difficulty as "Low"`,
      evidence: `Real data shows ${rv.meaningful_competitor_count} established competitors with a meaningful review history — that's a crowded field, not an easy entry.`,
    })
  }

  // 3. BUILD_NOW with no real documented customer pain
  // Uses the live `decision` argument, not m.build_decision (stored at
  // generation time, under whatever scoring formula was live then) — so
  // this can never flag (or fail to flag) based on a stale decision.
  const ci = m.consumer_intelligence
  if (ci && decision === 'BUILD_NOW' && ci.totalReviewsCollected >= 30) {
    const hasRealPainSignal = ci.negativeThemes.length > 0 || ci.featureRequests.length > 0
    if (!hasRealPainSignal) {
      flags.push({
        field:    'build_decision',
        claim:    `Memo recommends BUILD_NOW`,
        evidence: `Real review analysis of ${ci.totalReviewsCollected} competitor reviews found no recurring complaint or feature request that met the minimum support threshold — no documented gap to point to.`,
      })
    }
  }

  // 4. Demand score vs real revenue/demand evidence mismatch
  const demandScore = m.scores.demand?.score
  if (typeof demandScore === 'number' && demandScore >= 8) {
    const realRevenueScore = m.signal_evidence?.revenue?.value.score
    const realDemandScore  = m.signal_evidence?.demand?.value.score ?? m.signal_evidence?.growth?.value.score
    if (typeof realRevenueScore === 'number' && realRevenueScore <= 3) {
      flags.push({
        field:    'scores.demand',
        claim:    `Memo rates Demand ${demandScore}/10`,
        evidence: `Real Keepa revenue data for this category's bestsellers scores only ${realRevenueScore}/10 — a weak real signal underneath a strong demand claim.`,
      })
    } else if (typeof realDemandScore === 'number' && realDemandScore <= 3) {
      flags.push({
        field:    'scores.demand',
        claim:    `Memo rates Demand ${demandScore}/10`,
        evidence: `Real demand signal data scores only ${realDemandScore}/10 — a weak real signal underneath a strong demand claim.`,
      })
    }
  }

  return flags
}
