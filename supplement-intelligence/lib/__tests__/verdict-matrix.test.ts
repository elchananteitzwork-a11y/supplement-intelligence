// Verdict Matrix tests — Roadmap M2.4.
//
// Acceptance criteria under test (roadmap, verbatim):
//   "All seven verdicts reachable via fixtures; matrix cell logic unit-tested."
//   "Timing never enters the Quality score (Principle 7 test: same pillar
//    inputs at different stages produce the same Quality, different verdicts)."
//   "Ledger schema records both axes." — covered separately by
//   lib/verdict-ledger's own extraction tests reading memo.opportunity_quality
//   / memo.market_verdict; this file covers the pure computation.

import { describe, it, expect } from 'vitest'
import { computeOpportunityQuality, computeMarketVerdict, VERDICT_MATRIX_VERSION } from '../verdict-matrix'
import type { MarketVerdict } from '../verdict-matrix'
import type { MemoData } from '@/types/index'
import type { GroundedScore, ScoreDimension } from '@/lib/scoring'
import type { ConfidenceAssessment } from '@/lib/confidence'

function dim(key: string, rawScore: number, source: ScoreDimension['source'] = 'verified', weight = 0.2): ScoreDimension {
  return { key, label: key, weight, rawScore, source, sourceLabel: 'test' }
}

function grounded(dimensions: ScoreDimension[], verdictOverrideReasons?: string[]): GroundedScore {
  return {
    score: 60, decision: 'VALIDATE_FURTHER', dimensions,
    groundedPct: 100, insufficientEvidence: false,
    evidenceBreadth: { contributingProviders: [], totalScoreEligibleProviders: 8, pct: 0, channelBreakdown: [], distinctChannelTypes: 0, crossChannelCorroborated: false },
    verdictOverrideReasons,
  }
}

function memoWithSupplyVelocity(score: number | undefined, sample_size = 20): MemoData {
  return {
    signal_evidence: score === undefined ? {} : {
      supply_velocity: {
        value: { score, confidence: 0.7, young_listing_pct_12m: 0.2, young_listing_pct_24m: 0.4, entry_velocity_ratio: 0.5, entry_velocity: 'Stable', sample_size },
        sources: ['keepa'], primarySource: 'keepa', confidence: 0.7,
      },
    },
  } as unknown as MemoData
}

function confidence(channelsConfirmingForDemand: number): ConfidenceAssessment {
  return {
    confidenceModelVersion: 'test',
    dimensions: [
      { key: 'demand', label: 'Demand', confidence: 0.8, witnesses: [], confirmingChannelCount: channelsConfirmingForDemand, channelMismatch: false },
    ],
    overallConfidence: 0.8, weakestDimension: 'demand', distinctConfirmingChannels: channelsConfirmingForDemand,
  }
}

// A fully-loaded, all-pillars-verified fixture, tunable per test via a raw
// score override for each dimension.
function fullFixture(opts: {
  demand?: number; profitability?: number; marketAccess?: number; consumerPain?: number; supplyVelocity?: number
} = {}) {
  const {
    demand = 8, profitability = 8, marketAccess = 8, consumerPain = 8, supplyVelocity = 8,
  } = opts
  const g = grounded([
    dim('demand', demand),
    dim('profitability', profitability),
    dim('marketAccessibility', marketAccess),
    dim('consumerPain', consumerPain),
    dim('virality', 9), // present but must never be read by the pillar model
    dim('subscription', 9), // present but must never be read by the pillar model
  ])
  const m = memoWithSupplyVelocity(supplyVelocity)
  return { g, m }
}

describe('computeOpportunityQuality — pillar assembly', () => {
  it('blends all four pillars by their BASE_WEIGHTS priors (30/25/25/20) when every input is verified', () => {
    const { g, m } = fullFixture({ demand: 10, profitability: 10, marketAccess: 10, consumerPain: 10, supplyVelocity: 10 })
    const q = computeOpportunityQuality(g, m)
    expect(q.score).toBe(100)
    expect(q.tier).toBe('High')
    expect(q.pillars).toHaveLength(4)
    expect(q.pillars.every(p => p.source === 'verified')).toBe(true)
  })

  it('excludes a pillar with no verified input and redistributes its weight (never fabricates a score)', () => {
    const g = grounded([
      dim('demand', 10),
      // profitability/marketAccessibility both absent -> Entry Economics excluded
      dim('consumerPain', 10),
    ])
    const m = memoWithSupplyVelocity(10)
    const q = computeOpportunityQuality(g, m)
    const econ = q.pillars.find(p => p.key === 'entryEconomics')
    expect(econ?.source).toBe('excluded')
    expect(econ?.weight).toBe(0)
    expect(econ?.rawScore).toBeUndefined()
    // Remaining 3 pillars (30+25+20=75 prior) carry a perfect 10 -> full 100 score.
    expect(q.score).toBe(100)
  })

  it('Pillar 2 (Supply Response) reuses M2.3 supply_velocity.score verbatim, not a recomputation', () => {
    const g = grounded([dim('demand', 5)])
    const m = memoWithSupplyVelocity(3)
    const q = computeOpportunityQuality(g, m)
    const supply = q.pillars.find(p => p.key === 'supplyResponse')
    expect(supply?.rawScore).toBe(3)
    expect(supply?.source).toBe('verified')
  })

  it('excludes Supply Response when supply_velocity was never contributed (undersized sample, etc.)', () => {
    const g = grounded([dim('demand', 5)])
    const m = memoWithSupplyVelocity(undefined)
    const q = computeOpportunityQuality(g, m)
    const supply = q.pillars.find(p => p.key === 'supplyResponse')
    expect(supply?.source).toBe('excluded')
  })

  it('Pillar 3 (Entry Economics) blends profitability + marketAccessibility using the existing 20/18 sub-weights', () => {
    const g = grounded([dim('profitability', 10), dim('marketAccessibility', 0)])
    const m = memoWithSupplyVelocity(undefined)
    const q = computeOpportunityQuality(g, m)
    const econ = q.pillars.find(p => p.key === 'entryEconomics')
    // (10*20 + 0*18) / 38 = 5.26 -> rounds to 5.3
    expect(econ?.rawScore).toBeCloseTo((10 * 20) / 38, 1)
  })

  it('never reads virality or subscription into any pillar (disclosed exclusion — not named by any Blueprint pillar)', () => {
    const g = grounded([dim('virality', 10), dim('subscription', 10)])
    const m = memoWithSupplyVelocity(undefined)
    const q = computeOpportunityQuality(g, m)
    expect(q.score).toBe(0)
    expect(q.pillars.every(p => p.source === 'excluded')).toBe(true)
  })

  it('a qualitative (source: synthesized) dimension does not count as verified for its pillar', () => {
    const g = grounded([dim('demand', 9, 'synthesized', 0)])
    const m = memoWithSupplyVelocity(undefined)
    const q = computeOpportunityQuality(g, m)
    expect(q.pillars.find(p => p.key === 'demandReality')?.source).toBe('excluded')
  })

  it('tier boundaries match the reused >=70/>=45 thresholds', () => {
    const hf = fullFixture({ demand: 10, profitability: 10, marketAccess: 10, consumerPain: 10, supplyVelocity: 10 })
    const mf = fullFixture({ demand: 5, profitability: 5, marketAccess: 5, consumerPain: 5, supplyVelocity: 5 })
    const lf = fullFixture({ demand: 1, profitability: 1, marketAccess: 1, consumerPain: 1, supplyVelocity: 1 })
    expect(computeOpportunityQuality(hf.g, hf.m).tier).toBe('High')
    expect(computeOpportunityQuality(mf.g, mf.m).tier).toBe('Mid')
    expect(computeOpportunityQuality(lf.g, lf.m).tier).toBe('Low')
  })

  it('every OpportunityQuality names its own model version', () => {
    const { g, m } = fullFixture()
    expect(computeOpportunityQuality(g, m).version).toBe(VERDICT_MATRIX_VERSION)
  })
})

describe('computeOpportunityQuality — Principle 7 (timing-invariance)', () => {
  it('takes no lifecycle stage argument at all, so the same pillar inputs always yield the same Quality regardless of the stage later passed to computeMarketVerdict', () => {
    const { g, m } = fullFixture({ demand: 8, profitability: 6, marketAccess: 7, consumerPain: 5, supplyVelocity: 9 })
    const qA = computeOpportunityQuality(g, m)
    const qB = computeOpportunityQuality(g, m)
    expect(qA.score).toBe(qB.score)

    const conf = confidence(2)
    const verdictAtWindowOpen = computeMarketVerdict(qA, 'Window Open', g, conf)
    const verdictAtSaturated  = computeMarketVerdict(qB, 'Saturated', g, conf)
    // Same Quality score feeding two different lifecycle stages...
    expect(qA.score).toBe(qB.score)
    // ...produces two genuinely different verdicts, proving timing was never
    // blended into the Quality number itself.
    expect(verdictAtWindowOpen.verdict).not.toBe(verdictAtSaturated.verdict)
  })
})

describe('computeMarketVerdict — the seven-verdict matrix (Blueprint §8)', () => {
  const conf2 = confidence(2)

  it('BUILD_NOW: High quality + Window Open + gate passes', () => {
    const { g, m } = fullFixture()
    const q = computeOpportunityQuality(g, m)
    const r = computeMarketVerdict(q, 'Window Open', g, conf2)
    expect(r.verdict).toBe('BUILD_NOW')
    expect(r.buildNowGate?.passed).toBe(true)
  })

  it('BUILD_IF_DIFFERENTIATED: High quality + Contested', () => {
    const { g, m } = fullFixture()
    const q = computeOpportunityQuality(g, m)
    const r = computeMarketVerdict(q, 'Contested', g, conf2)
    expect(r.verdict).toBe('BUILD_IF_DIFFERENTIATED')
  })

  it('WATCH_CLOSELY: High quality + Emerging', () => {
    const { g, m } = fullFixture()
    const q = computeOpportunityQuality(g, m)
    const r = computeMarketVerdict(q, 'Emerging', g, conf2)
    expect(r.verdict).toBe('WATCH_CLOSELY')
  })

  it('WATCH: Mid quality + Emerging', () => {
    const { g, m } = fullFixture({ demand: 5, profitability: 5, marketAccess: 5, consumerPain: 5, supplyVelocity: 5 })
    const q = computeOpportunityQuality(g, m)
    const r = computeMarketVerdict(q, 'Emerging', g, conf2)
    expect(r.verdict).toBe('WATCH')
  })

  it('INVESTIGATE: Mid quality + Window Open', () => {
    const { g, m } = fullFixture({ demand: 5, profitability: 5, marketAccess: 5, consumerPain: 5, supplyVelocity: 5 })
    const q = computeOpportunityQuality(g, m)
    const r = computeMarketVerdict(q, 'Window Open', g, conf2)
    expect(r.verdict).toBe('INVESTIGATE')
  })

  it('AVOID: High quality + Saturated (red ocean with good fundamentals)', () => {
    const { g, m } = fullFixture()
    const q = computeOpportunityQuality(g, m)
    const r = computeMarketVerdict(q, 'Saturated', g, conf2)
    expect(r.verdict).toBe('AVOID')
  })

  it('AVOID: Mid quality + Contested', () => {
    const { g, m } = fullFixture({ demand: 5, profitability: 5, marketAccess: 5, consumerPain: 5, supplyVelocity: 5 })
    const q = computeOpportunityQuality(g, m)
    const r = computeMarketVerdict(q, 'Contested', g, conf2)
    expect(r.verdict).toBe('AVOID')
  })

  it('PASS: Low quality, any lifecycle stage', () => {
    const { g, m } = fullFixture({ demand: 1, profitability: 1, marketAccess: 1, consumerPain: 1, supplyVelocity: 1 })
    const q = computeOpportunityQuality(g, m)
    for (const stage of ['Emerging', 'Window Open', 'Contested', 'Saturated'] as const) {
      expect(computeMarketVerdict(q, stage, g, conf2).verdict).toBe('PASS')
    }
  })

  it('Latent (edge stage): High/Mid quality resolves to WATCH, Low resolves to PASS', () => {
    const high = fullFixture()
    const low  = fullFixture({ demand: 1, profitability: 1, marketAccess: 1, consumerPain: 1, supplyVelocity: 1 })
    const qHigh = computeOpportunityQuality(high.g, high.m)
    const qLow  = computeOpportunityQuality(low.g, low.m)
    expect(computeMarketVerdict(qHigh, 'Latent', high.g, conf2).verdict).toBe('WATCH')
    expect(computeMarketVerdict(qLow, 'Latent', low.g, conf2).verdict).toBe('PASS')
  })

  it('Declining (edge stage): High/Mid quality resolves to AVOID, Low resolves to PASS', () => {
    const high = fullFixture()
    const low  = fullFixture({ demand: 1, profitability: 1, marketAccess: 1, consumerPain: 1, supplyVelocity: 1 })
    const qHigh = computeOpportunityQuality(high.g, high.m)
    const qLow  = computeOpportunityQuality(low.g, low.m)
    expect(computeMarketVerdict(qHigh, 'Declining', high.g, conf2).verdict).toBe('AVOID')
    expect(computeMarketVerdict(qLow, 'Declining', low.g, conf2).verdict).toBe('PASS')
  })

  it('every possible MarketVerdict value is reachable', () => {
    const reached = new Set<MarketVerdict>()
    const high = fullFixture(); const mid = fullFixture({ demand: 5, profitability: 5, marketAccess: 5, consumerPain: 5, supplyVelocity: 5 }); const low = fullFixture({ demand: 1, profitability: 1, marketAccess: 1, consumerPain: 1, supplyVelocity: 1 })
    const qHigh = computeOpportunityQuality(high.g, high.m)
    const qMid  = computeOpportunityQuality(mid.g, mid.m)
    const qLow  = computeOpportunityQuality(low.g, low.m)

    reached.add(computeMarketVerdict(qHigh, 'Window Open', high.g, conf2).verdict)
    reached.add(computeMarketVerdict(qHigh, 'Contested', high.g, conf2).verdict)
    reached.add(computeMarketVerdict(qHigh, 'Emerging', high.g, conf2).verdict)
    reached.add(computeMarketVerdict(qMid, 'Emerging', mid.g, conf2).verdict)
    reached.add(computeMarketVerdict(qMid, 'Window Open', mid.g, conf2).verdict)
    reached.add(computeMarketVerdict(qHigh, 'Saturated', high.g, conf2).verdict)
    reached.add(computeMarketVerdict(qLow, 'Saturated', low.g, conf2).verdict)

    const expected: MarketVerdict[] = ['BUILD_NOW', 'BUILD_IF_DIFFERENTIATED', 'WATCH_CLOSELY', 'WATCH', 'INVESTIGATE', 'AVOID', 'PASS']
    for (const v of expected) expect(reached.has(v)).toBe(true)
  })

  it('every result names its own model version', () => {
    const { g, m } = fullFixture()
    const q = computeOpportunityQuality(g, m)
    expect(computeMarketVerdict(q, 'Window Open', g, conf2).version).toBe(VERDICT_MATRIX_VERSION)
  })
})

describe('computeMarketVerdict — BUILD_NOW gate (Blueprint §8)', () => {
  it('downgrades to WATCH_CLOSELY when fewer than 2 independent demand channels confirm', () => {
    const { g, m } = fullFixture()
    const q = computeOpportunityQuality(g, m)
    const r = computeMarketVerdict(q, 'Window Open', g, confidence(1))
    expect(r.verdict).toBe('WATCH_CLOSELY')
    expect(r.buildNowGate?.passed).toBe(false)
    expect(r.buildNowGate?.channelsConfirming).toBe(1)
  })

  it('downgrades to WATCH_CLOSELY when Entry Economics is not verified', () => {
    const g = grounded([
      dim('demand', 10),
      // profitability/marketAccessibility both absent -> Entry Economics excluded
      dim('consumerPain', 10),
    ])
    const m = memoWithSupplyVelocity(10)
    const q = computeOpportunityQuality(g, m)
    // Force High tier despite the missing pillar for this test's purpose.
    const r = computeMarketVerdict(q, 'Window Open', g, confidence(2))
    expect(r.buildNowGate?.entryEconomicsVerified).toBe(false)
    expect(r.verdict).toBe('WATCH_CLOSELY')
  })

  it('downgrades to WATCH_CLOSELY when the safety gate fired', () => {
    const { g: base, m } = fullFixture()
    const g: GroundedScore = { ...base, verdictOverrideReasons: ['Safety gate: recent FDA recall'] }
    const q = computeOpportunityQuality(g, m)
    const r = computeMarketVerdict(q, 'Window Open', g, confidence(2))
    expect(r.buildNowGate?.safetyGateClear).toBe(false)
    expect(r.verdict).toBe('WATCH_CLOSELY')
  })

  it('leaves buildNowGate null for every cell that never resolves to BUILD_NOW pre-gate', () => {
    const { g, m } = fullFixture()
    const q = computeOpportunityQuality(g, m)
    const r = computeMarketVerdict(q, 'Contested', g, confidence(2))
    expect(r.buildNowGate).toBeNull()
  })
})
