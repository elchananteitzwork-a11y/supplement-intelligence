// Unit tests for lib/partner-copy.ts — V4 Phase 1 (Stream/Hunt/Brief/Pull).
// Same style as components/memo/__tests__/field-derivations.test.ts: pure
// functions tested directly against real backend types, no component
// rendering.

import { describe, it, expect } from 'vitest'
import {
  VERDICT_WORD, INSUFFICIENT_EVIDENCE_VERDICT_WORD, verdictWord,
  RECOMMENDED_PULL, recommendedPull, alternativePulls,
  buildConvictionSentence,
  buildWhySentence,
  buildInsufficientEvidenceReadout,
  toPlainProvenance, scoreDimensionProvenance,
  selectForDrivers, selectAgainstDrivers, buildPrimaryRiskDriver, buildAgainstCase,
  windowInWords,
  freshnessStamp,
  buildValidationPlan,
  killRedirectionLine,
  buildClaimEvidence,
} from '../partner-copy'
import type { MemoData, BuildDecision } from '@/types/index'
import type { GroundedScore, ScoreDimension, EvidenceBreadth } from '@/lib/scoring'
import type { ConfidenceAssessment } from '@/lib/confidence'

function dim(overrides: Partial<ScoreDimension> = {}): ScoreDimension {
  return { key: 'demand', label: 'Demand', weight: 22, source: 'verified', sourceLabel: 'DataForSEO — 12,000/mo', ...overrides }
}

function grounded(overrides: Partial<GroundedScore> = {}): GroundedScore {
  return {
    score: 60, decision: 'VALIDATE_FURTHER', dimensions: [], groundedPct: 100,
    insufficientEvidence: false,
    evidenceBreadth: { contributingProviders: [], totalScoreEligibleProviders: 0, pct: 0, channelBreakdown: [], distinctChannelTypes: 0, crossChannelCorroborated: false },
    ...overrides,
  }
}

function memo(overrides: Partial<MemoData> = {}): MemoData {
  return { scores: {} as MemoData['scores'], ...overrides } as MemoData
}

// ── verdict words ───────────────────────────────────────────────────────

describe('verdictWord', () => {
  it('maps every real decision to the frozen plain-language word', () => {
    expect(VERDICT_WORD.BUILD_NOW).toBe('Entry Supported')
    expect(VERDICT_WORD.VALIDATE_FURTHER).toBe('Validation Required')
    expect(VERDICT_WORD.SKIP).toBe('Not Supported')
    expect(VERDICT_WORD.CATEGORY_CREATION_CANDIDATE).toBe('Category Creation')
  })

  it('returns each decision word for a normal, sufficient-evidence result', () => {
    for (const d of Object.keys(VERDICT_WORD) as BuildDecision[]) {
      expect(verdictWord(grounded({ decision: d, insufficientEvidence: false }))).toBe(VERDICT_WORD[d])
    }
  })

  it('overrides to the insufficient-evidence first-class state regardless of decision', () => {
    expect(verdictWord(grounded({ decision: 'BUILD_NOW', insufficientEvidence: true }))).toBe(INSUFFICIENT_EVIDENCE_VERDICT_WORD)
  })
})

// ── recommended Pull verb (RD_V4_PHASE1.md §4.3, deterministic) ─────────

describe('recommendedPull', () => {
  it('maps BUILD_NOW and VALIDATE_FURTHER to Validate', () => {
    expect(recommendedPull('BUILD_NOW').verb).toBe('Validate')
    expect(recommendedPull('VALIDATE_FURTHER').verb).toBe('Validate')
  })
  it('maps SKIP to Kill, recorded as a save', () => {
    const r = recommendedPull('SKIP')
    expect(r.verb).toBe('Kill')
    expect(r.sublabel).toMatch(/save/)
  })
  it('maps CATEGORY_CREATION_CANDIDATE to Watch', () => {
    expect(recommendedPull('CATEGORY_CREATION_CANDIDATE').verb).toBe('Watch')
  })
  it('every decision has exactly one recommended verb, matching RECOMMENDED_PULL', () => {
    for (const d of Object.keys(RECOMMENDED_PULL) as BuildDecision[]) {
      expect(recommendedPull(d)).toEqual(RECOMMENDED_PULL[d])
    }
  })
})

describe('alternativePulls', () => {
  it('never includes the recommended verb, and lists the other two', () => {
    for (const d of Object.keys(RECOMMENDED_PULL) as BuildDecision[]) {
      const alts = alternativePulls(d)
      expect(alts).not.toContain(recommendedPull(d).verb)
      expect(alts).toHaveLength(2)
    }
  })
})

// ── conviction sentence ──────────────────────────────────────────────────

describe('buildConvictionSentence', () => {
  const dims = [dim({ key: 'demand', label: 'Demand' }), dim({ key: 'virality', label: 'Virality' })]

  it('High tier (>=50%) reads "fairly sure"', () => {
    const a: Pick<ConfidenceAssessment, 'overallConfidence' | 'weakestDimension'> = { overallConfidence: 0.6, weakestDimension: 'virality' }
    const s = buildConvictionSentence(a, dims)
    expect(s.tier).toBe('High')
    expect(s.phrase).toMatch(/fairly sure/)
    expect(s.weakestLinkLabel).toBe('Virality')
    expect(s.sentence).toBe("I'm fairly sure of this one — Virality is the weakest link.")
  })

  it('Medium tier (25-49%) reads "moderately sure"', () => {
    const a = { overallConfidence: 0.3, weakestDimension: 'demand' }
    expect(buildConvictionSentence(a, dims).tier).toBe('Medium')
    expect(buildConvictionSentence(a, dims).phrase).toMatch(/moderately sure/)
  })

  it('Low tier (<25%) reads "hold this one loosely"', () => {
    const a = { overallConfidence: 0.1, weakestDimension: 'demand' }
    expect(buildConvictionSentence(a, dims).tier).toBe('Low')
    expect(buildConvictionSentence(a, dims).phrase).toBe('hold this one loosely')
  })

  it('null confidence (no scored dimensions) reads the honest None tier, no weakest link named', () => {
    const a = { overallConfidence: null, weakestDimension: null }
    const s = buildConvictionSentence(a, dims)
    expect(s.tier).toBe('None')
    expect(s.weakestLinkLabel).toBeNull()
    expect(s.sentence).not.toMatch(/weakest link/)
  })

  it('never fabricates a weakest-link label when the key does not match any dimension', () => {
    const a = { overallConfidence: 0.6, weakestDimension: 'nonexistent' }
    expect(buildConvictionSentence(a, dims).weakestLinkLabel).toBeNull()
  })
})

// ── why sentence ──────────────────────────────────────────────────────────

describe('buildWhySentence', () => {
  it('prefers the real causal_paragraph when not a fallback', () => {
    const m = memo({ writer_output: { causal_paragraph: 'Real reason.', causal_paragraph_is_fallback: false, risk_sentence: '', risk_sentence_is_fallback: true, product_thesis_headline: '', product_thesis_full: '', product_thesis_is_fallback: true, validation_trace: {} }, build_explanation: 'Fallback reason.' })
    expect(buildWhySentence(m, grounded())).toBe('Real reason.')
  })

  it('falls back to build_explanation when the writer step itself fell back', () => {
    const m = memo({ writer_output: { causal_paragraph: 'x', causal_paragraph_is_fallback: true, risk_sentence: '', risk_sentence_is_fallback: true, product_thesis_headline: '', product_thesis_full: '', product_thesis_is_fallback: true, validation_trace: {} }, build_explanation: 'Fallback reason.' })
    expect(buildWhySentence(m, grounded())).toBe('Fallback reason.')
  })

  it('names a gate explicitly when verdictOverrideReasons is present', () => {
    const m = memo({ build_explanation: 'Base reason.' })
    const g = grounded({ verdictOverrideReasons: ['Safety gate overrode score-threshold verdict (VALIDATE_FURTHER).'] })
    expect(buildWhySentence(m, g)).toBe('Base reason. A gate held the verdict back: Safety gate overrode score-threshold verdict (VALIDATE_FURTHER).')
  })
})

// ── insufficient evidence ──────────────────────────────────────────────────

describe('buildInsufficientEvidenceReadout', () => {
  it('lists which real channels came up empty', () => {
    const eb: EvidenceBreadth = {
      contributingProviders: [], totalScoreEligibleProviders: 3, pct: 0, distinctChannelTypes: 0, crossChannelCorroborated: false,
      channelBreakdown: [
        { channel: 'amazon_market', label: 'Amazon Marketplace', contributed: false, providers: [] },
        { channel: 'search_intent', label: 'Search / SEO', contributed: true, providers: ['dataforseo'] },
        { channel: 'social_attention', label: 'Social Attention', contributed: false, providers: [] },
      ],
    }
    const r = buildInsufficientEvidenceReadout(eb)
    expect(r.verdictWord).toBe(INSUFFICIENT_EVIDENCE_VERDICT_WORD)
    expect(r.emptyChannels).toEqual(['Amazon Marketplace', 'Social Attention'])
    expect(r.callableCondition).toMatch(/Amazon Marketplace or Social Attention/)
  })

  it('gives an honest generic condition when every channel already reported (no real gap to name)', () => {
    const eb: EvidenceBreadth = { contributingProviders: [], totalScoreEligibleProviders: 1, pct: 100, distinctChannelTypes: 1, crossChannelCorroborated: false, channelBreakdown: [{ channel: 'amazon_market', label: 'Amazon Marketplace', contributed: true, providers: ['keepa'] }] }
    expect(buildInsufficientEvidenceReadout(eb).emptyChannels).toEqual([])
  })
})

// ── provenance (5-level -> 3 plain words) ──────────────────────────────────

describe('toPlainProvenance', () => {
  it('maps verified to measured', () => expect(toPlainProvenance('verified')).toBe('measured'))
  it('maps estimated and synthesized to my judgment', () => {
    expect(toPlainProvenance('estimated')).toBe('my judgment')
    expect(toPlainProvenance('synthesized')).toBe('my judgment')
  })
  it("maps unknown and unsupported to couldn't verify", () => {
    expect(toPlainProvenance('unknown')).toBe("couldn't verify")
    expect(toPlainProvenance('unsupported')).toBe("couldn't verify")
  })
})

describe('scoreDimensionProvenance', () => {
  it('maps the 2-level ScoreDimension source correctly', () => {
    expect(scoreDimensionProvenance('verified')).toBe('measured')
    expect(scoreDimensionProvenance('synthesized')).toBe('my judgment')
  })
})

// ── driver selection (top-3 for / top-2 against, never padded) ──────────

describe('selectForDrivers', () => {
  it('selects strong (rawScore >= 6) dimensions, sorted descending, capped at 3', () => {
    const dims = [
      dim({ key: 'a', label: 'A', rawScore: 9 }),
      dim({ key: 'b', label: 'B', rawScore: 6 }),
      dim({ key: 'c', label: 'C', rawScore: 8 }),
      dim({ key: 'd', label: 'D', rawScore: 3 }), // weak, excluded
    ]
    const drivers = selectForDrivers({ dimensions: dims })
    expect(drivers.map(d => d.claimKey)).toEqual(['a', 'c', 'b'])
    expect(drivers).toHaveLength(3)
  })

  it('never pads — renders fewer than 3 when fewer than 3 real strong dimensions exist', () => {
    const dims = [dim({ key: 'a', rawScore: 9 })]
    expect(selectForDrivers({ dimensions: dims })).toHaveLength(1)
  })

  it('renders zero (not a fabricated placeholder) when nothing is strong', () => {
    const dims = [dim({ key: 'a', rawScore: 2 })]
    expect(selectForDrivers({ dimensions: dims })).toHaveLength(0)
  })

  it('excludes weight-0 (excluded) dimensions even with a high qualitative level', () => {
    const dims = [dim({ key: 'a', weight: 0, qualitativeLevel: 'High', rawScore: undefined })]
    expect(selectForDrivers({ dimensions: dims })).toHaveLength(0)
  })

  it('shows the real number right (rawScore) and the real words-left sentence', () => {
    const dims = [dim({ key: 'a', label: 'Demand', rawScore: 8.4, sourceLabel: '12,000/mo (DataForSEO)' })]
    const [d] = selectForDrivers({ dimensions: dims })
    expect(d.number).toBe('8.4/10')
    expect(d.text).toBe('Demand: 12,000/mo (DataForSEO)')
    expect(d.provenance).toBe('measured')
  })

  it('falls back to the qualitative word (never a fabricated number) when only AI judgment exists', () => {
    const dims = [dim({ key: 'a', rawScore: undefined, qualitativeLevel: 'High', source: 'synthesized' })]
    const [d] = selectForDrivers({ dimensions: dims })
    expect(d.number).toBe('High')
    expect(d.provenance).toBe('my judgment')
  })
})

describe('selectAgainstDrivers', () => {
  it('selects weak (rawScore <= 4) dimensions, sorted ascending, capped at 2', () => {
    const dims = [
      dim({ key: 'a', rawScore: 1 }),
      dim({ key: 'b', rawScore: 4 }),
      dim({ key: 'c', rawScore: 2 }),
      dim({ key: 'd', rawScore: 9 }), // strong, excluded
    ]
    const drivers = selectAgainstDrivers({ dimensions: dims })
    expect(drivers.map(d => d.claimKey)).toEqual(['a', 'c'])
  })

  it('never pads — renders fewer than 2 when fewer real weak dimensions exist', () => {
    expect(selectAgainstDrivers({ dimensions: [dim({ rawScore: 8 })] })).toHaveLength(0)
  })
})

describe('buildPrimaryRiskDriver', () => {
  it('returns null when writer_output is absent', () => {
    expect(buildPrimaryRiskDriver(memo(), { dimensions: [] })).toBeNull()
  })
  it('returns null when the risk sentence is a fallback (not real AI output)', () => {
    const m = memo({ writer_output: { causal_paragraph: '', causal_paragraph_is_fallback: true, risk_sentence: 'Generic fallback risk.', risk_sentence_is_fallback: true, product_thesis_headline: '', product_thesis_full: '', product_thesis_is_fallback: true, validation_trace: {} } })
    expect(buildPrimaryRiskDriver(m, { dimensions: [] })).toBeNull()
  })
  it('grounds a real risk sentence in the weakest scored dimension', () => {
    const m = memo({ writer_output: { causal_paragraph: '', causal_paragraph_is_fallback: true, risk_sentence: 'Manufacturing is thin.', risk_sentence_is_fallback: false, product_thesis_headline: '', product_thesis_full: '', product_thesis_is_fallback: true, validation_trace: {} } })
    const dims = [dim({ key: 'a', rawScore: 8 }), dim({ key: 'b', rawScore: 2 })]
    const r = buildPrimaryRiskDriver(m, { dimensions: dims })
    expect(r).not.toBeNull()
    expect(r!.text).toBe('Manufacturing is thin.')
    expect(r!.claimKey).toBe('b')
  })
})

describe('buildAgainstCase', () => {
  it('puts the primary risk sentence first, then fills remaining slots with the next-weakest dimension, deduplicated', () => {
    const m = memo({ writer_output: { causal_paragraph: '', causal_paragraph_is_fallback: true, risk_sentence: 'Primary risk text.', risk_sentence_is_fallback: false, product_thesis_headline: '', product_thesis_full: '', product_thesis_is_fallback: true, validation_trace: {} } })
    const dims = [dim({ key: 'weakest', rawScore: 1 }), dim({ key: 'next', rawScore: 3 })]
    const rows = buildAgainstCase(m, { dimensions: dims })
    expect(rows).toHaveLength(2)
    expect(rows[0].text).toBe('Primary risk text.')
    expect(rows[0].claimKey).toBe('weakest')
    expect(rows[1].claimKey).toBe('next')
  })

  it('falls back to plain weak-dimension selection when there is no real risk sentence', () => {
    const dims = [dim({ key: 'a', rawScore: 1 }), dim({ key: 'b', rawScore: 3 })]
    const rows = buildAgainstCase(memo(), { dimensions: dims })
    expect(rows.map(r => r.claimKey)).toEqual(['a', 'b'])
  })
})

// ── the window in words ──────────────────────────────────────────────────

describe('windowInWords', () => {
  it('returns null when there is no real lifecycle classification', () => {
    expect(windowInWords(null, null)).toBeNull()
  })
  it('names the stage alone when gap velocity is unavailable', () => {
    expect(windowInWords({ stage: 'Window Open' }, null)).toBe('The window: Window Open.')
  })
  it('names widening/narrowing/flat from the real signed gap velocity value', () => {
    expect(windowInWords({ stage: 'Window Open' }, { display: '+12.4 pts', value: 12.4 })).toBe('The window: Window Open, and widening (+12.4 pts).')
    expect(windowInWords({ stage: 'Contested' }, { display: '-5.2 pts', value: -5.2 })).toBe('The window: Contested, and narrowing (-5.2 pts).')
    expect(windowInWords({ stage: 'Contested' }, { display: '0.0 pts', value: 0 })).toBe('The window: Contested, and flat (0.0 pts).')
  })
})

// ── freshness stamp ───────────────────────────────────────────────────────

describe('freshnessStamp', () => {
  it('formats the real creation date and includes the mandatory CPO amendment text', () => {
    const s = freshnessStamp('2026-07-01T12:00:00.000Z')
    expect(s).toMatch(/^Researched Jul 1, 2026/)
    expect(s).toContain('conditions re-checked weekly')
    expect(s).toContain('the full picture may have moved since')
  })
  it('degrades honestly for an invalid date rather than showing "Invalid Date"', () => {
    expect(freshnessStamp('not-a-date')).toContain('Researched an unknown date')
  })
})

// ── validation plan ───────────────────────────────────────────────────────

describe('buildValidationPlan', () => {
  it('BUILD_NOW: produces an execution plan with a manufacturing-tiered budget', () => {
    const m = memo({ scores: { manufacturing: { level: 'Medium', notes: '' } } as MemoData['scores'], financial_projections: { gross_margin: 'N/A', net_margin_at_scale: '', path_to_10m: '' } })
    const plan = buildValidationPlan(m, 'BUILD_NOW')
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(plan.budget.range).toBe('$7k–$18k')
  })

  it('SKIP: no manufacturing budget, market-research-only line', () => {
    const plan = buildValidationPlan(memo({ financial_projections: { gross_margin: 'N/A', net_margin_at_scale: '', path_to_10m: '' } }), 'SKIP')
    expect(plan.budget.range).toBe('$500–$2k')
    expect(plan.budget.breakdown).toMatch(/not fund manufacturing/i)
  })

  it('always includes a subscription/repeat-purchase success metric even with no financial_projections data', () => {
    const plan = buildValidationPlan(memo({ financial_projections: { gross_margin: 'N/A', net_margin_at_scale: '', path_to_10m: '' } }), 'VALIDATE_FURTHER')
    expect(plan.successMetrics.length).toBeGreaterThan(0)
    expect(plan.successMetrics.some(s => /purchase|subscription/.test(s))).toBe(true)
  })

  it('never fabricates a $10k MRR metric when ten_k_probability is absent', () => {
    const plan = buildValidationPlan(memo({ financial_projections: { gross_margin: 'N/A', net_margin_at_scale: '', path_to_10m: '' } }), 'BUILD_NOW')
    expect(plan.successMetrics.some(s => s.includes('$10k MRR'))).toBe(false)
  })
})

// ── tap-to-interrogate grounded evidence ───────────────────────────────────

describe('buildClaimEvidence', () => {
  it('demand: pulls real search volume/growth/momentum with provider names', () => {
    const m = memo({
      keyword_intelligence: { top_buying: [{ keyword: 'creatine gummies', monthly_searches: 12000 }] } as unknown as MemoData['keyword_intelligence'],
      signal_evidence: {
        growth: { value: { yoy_change: '+35%', momentum: 'Accelerating' }, sources: ['keepa'], primarySource: 'Keepa', confidence: 0.8 },
        demand: { value: { trend: '+21% YoY' }, sources: ['keepa'], primarySource: 'Keepa', confidence: 0.8 },
      } as unknown as MemoData['signal_evidence'],
    })
    const ev = buildClaimEvidence('demand', m)
    expect(ev.title).toBe('Demand')
    expect(ev.facts.find(f => f.label === 'Search volume')?.value).toContain('12,000/mo')
    expect(ev.facts.find(f => f.label === 'YoY growth')?.value).toBe('+35% (Keepa)')
    expect(ev.facts.every(f => f.provenance === 'measured')).toBe(true)
  })

  it('renders an empty (never fabricated) facts list when no real data exists for that claim', () => {
    const ev = buildClaimEvidence('demand', memo())
    expect(ev.facts).toEqual([])
  })

  it('profitability: marks an unverified gross margin as "couldn\'t verify", not "measured"', () => {
    const m = memo({ financial_projections: { gross_margin: 'Not independently verified', net_margin_at_scale: '', path_to_10m: '' } })
    const ev = buildClaimEvidence('profitability', m)
    expect(ev.facts.find(f => f.label === 'Gross margin')?.provenance).toBe("couldn't verify")
  })

  it('consumerPain: grounds the top complaint theme with its real mention counts', () => {
    const m = memo({ consumer_intelligence: { negativeThemes: [{ label: 'bloating', mentionedBy: 12, outOf: 40, exampleQuote: 'x' }] } as unknown as MemoData['consumer_intelligence'] })
    const ev = buildClaimEvidence('consumerPain', m)
    expect(ev.facts[0].value).toBe('bloating (12/40 reviews)')
  })

  it('returns an empty facts list (not an error) for an unrecognized claim key', () => {
    expect(buildClaimEvidence('unknown_claim', memo()).facts).toEqual([])
  })
})

// ── kill redirection ──────────────────────────────────────────────────────

describe('killRedirectionLine', () => {
  it('returns null (no fabricated redirection) when neither market_gaps nor brand_opportunities are real', () => {
    expect(killRedirectionLine(memo())).toBeNull()
  })
  it('uses the real market gap when present', () => {
    expect(killRedirectionLine(memo({ market_gaps: ['a real gap'] }))).toMatch(/a real gap/)
  })
  it('combines both real fields when both exist', () => {
    const line = killRedirectionLine(memo({ market_gaps: ['gap'], brand_opportunities: ['angle'] }))
    expect(line).toMatch(/gap/)
    expect(line).toMatch(/angle/)
  })
})
