// Verdict Ledger extraction tests — V2 Blueprint §11 / Roadmap M1.1.
// Pure-function tests: every value in the extracted entry must be traceable
// to a real field on the input memo/grounded-score, never fabricated.

import { describe, it, expect } from 'vitest'
import { extractVerdictLedgerEntry } from '../extract'
import type { ExtractLedgerEntryContext } from '../extract'
import type { MemoData } from '@/types/index'
import type { GroundedScore } from '@/lib/scoring'

function baseGrounded(overrides: Partial<GroundedScore> = {}): GroundedScore {
  return {
    score: 72.5,
    decision: 'BUILD_NOW',
    dimensions: [
      { key: 'demand', label: 'Demand', weight: 0.22, rawScore: 8.1, source: 'verified', sourceLabel: 'DataForSEO' },
      { key: 'marketAccessibility', label: 'Market Accessibility', weight: 0.18, rawScore: 6.4, source: 'verified', sourceLabel: 'Keepa + DataForSEO' },
      { key: 'manufacturing', label: 'Manufacturing Feasibility', weight: 0, qualitativeLevel: 'Medium', source: 'synthesized', sourceLabel: 'AI judgment — no supplier data' },
    ],
    groundedPct: 100,
    insufficientEvidence: false,
    evidenceBreadth: {
      contributingProviders: ['keepa', 'dataforseo'],
      totalScoreEligibleProviders: 8,
      pct: 25,
      channelBreakdown: [
        { channel: 'amazon_marketplace', label: 'Amazon Marketplace', contributed: true, providers: ['keepa'] },
        { channel: 'search_seo', label: 'Search / SEO', contributed: true, providers: ['dataforseo'] },
        { channel: 'social_community', label: 'Social / Community', contributed: false, providers: [] },
        { channel: 'manufacturing_supply', label: 'Manufacturing / Supply', contributed: false, providers: [] },
        { channel: 'regulatory_safety', label: 'Regulatory / Safety', contributed: false, providers: [] },
      ],
      distinctChannelTypes: 2,
      crossChannelCorroborated: true,
    },
    ...overrides,
  }
}

function baseMemo(overrides: Partial<MemoData> = {}): MemoData {
  return {
    category_name: 'Creatine Monohydrate',
    scoring_version: '2.7.0',
    build_decision: 'BUILD_NOW',
    ...overrides,
  } as MemoData
}

function baseCtx(overrides: Partial<ExtractLedgerEntryContext> = {}): ExtractLedgerEntryContext {
  return {
    memo: baseMemo(),
    grounded: baseGrounded(),
    userQuery: 'creatine gummies',
    normalizedMarket: 'creatine gummies',
    categoryId: 'supplements',
    engineVersion: '2.7.0',
    userId: 'user-123',
    analysisId: 'analysis-456',
    ...overrides,
  }
}

describe('extractVerdictLedgerEntry — identity and versioning', () => {
  it('carries analysis_id and user_id through unchanged', () => {
    const entry = extractVerdictLedgerEntry(baseCtx())
    expect(entry.analysis_id).toBe('analysis-456')
    expect(entry.user_id).toBe('user-123')
  })

  it('stamps engine_version from context, scoring_version from the memo', () => {
    const entry = extractVerdictLedgerEntry(baseCtx())
    expect(entry.engine_version).toBe('2.7.0')
    expect(entry.scoring_version).toBe('2.7.0')
  })

  it('scoring_version is null when the memo has none (never fabricated)', () => {
    const entry = extractVerdictLedgerEntry(baseCtx({ memo: baseMemo({ scoring_version: undefined }) }))
    expect(entry.scoring_version).toBeNull()
  })

  it('category comes from memo.category_name, not the raw query', () => {
    const entry = extractVerdictLedgerEntry(baseCtx())
    expect(entry.category).toBe('Creatine Monohydrate')
    expect(entry.user_query).toBe('creatine gummies')
  })
})

describe('extractVerdictLedgerEntry — verdict fields', () => {
  it('every analysis outcome writes a real verdict, not just BUILD_NOW', () => {
    for (const decision of ['BUILD_NOW', 'VALIDATE_FURTHER', 'SKIP', 'CATEGORY_CREATION_CANDIDATE'] as const) {
      const entry = extractVerdictLedgerEntry(baseCtx({ grounded: baseGrounded({ decision }) }))
      expect(entry.verdict).toBe(decision)
    }
  })

  it('report_status is content_skip only for SKIP, passed for every other verdict', () => {
    const skip = extractVerdictLedgerEntry(baseCtx({ grounded: baseGrounded({ decision: 'SKIP' }) }))
    expect(skip.report_status).toBe('content_skip')

    for (const decision of ['BUILD_NOW', 'VALIDATE_FURTHER', 'CATEGORY_CREATION_CANDIDATE'] as const) {
      const entry = extractVerdictLedgerEntry(baseCtx({ grounded: baseGrounded({ decision }) }))
      expect(entry.report_status).toBe('passed')
    }
  })

  it('opportunity_score and grounded_pct are read verbatim from GroundedScore', () => {
    const entry = extractVerdictLedgerEntry(baseCtx({ grounded: baseGrounded({ score: 41.3, groundedPct: 100 }) }))
    expect(entry.opportunity_score).toBe(41.3)
    expect(entry.grounded_pct).toBe(100)
  })

  it('insufficient-evidence memos still produce a valid, honest snapshot', () => {
    const entry = extractVerdictLedgerEntry(baseCtx({
      grounded: baseGrounded({ score: 0, decision: 'SKIP', groundedPct: 0, insufficientEvidence: true, dimensions: [] }),
    }))
    expect(entry.insufficient_evidence).toBe(true)
    expect(entry.grounded_pct).toBe(0)
    expect(entry.report_status).toBe('content_skip')
  })

  it('verdict_override_reasons defaults to an empty array, never undefined', () => {
    const entry = extractVerdictLedgerEntry(baseCtx({ grounded: baseGrounded({ verdictOverrideReasons: undefined }) }))
    expect(entry.verdict_override_reasons).toEqual([])
  })

  it('verdict_confidence is null when no expandable_cards exist — never guessed', () => {
    const entry = extractVerdictLedgerEntry(baseCtx({ memo: baseMemo({ expandable_cards: undefined }) }))
    expect(entry.verdict_confidence).toBeNull()
  })
})

describe('extractVerdictLedgerEntry — provider availability and dimension scores', () => {
  it('snapshots evidence breadth fields verbatim from GroundedScore', () => {
    const entry = extractVerdictLedgerEntry(baseCtx())
    expect(entry.contributing_providers).toEqual(['keepa', 'dataforseo'])
    expect(entry.evidence_breadth_pct).toBe(25)
    expect(entry.distinct_channel_types).toBe(2)
    expect(entry.cross_channel_corroborated).toBe(true)
    expect(entry.provider_channel_breakdown).toHaveLength(5)
  })

  it('dimension_scores mirrors every GroundedScore dimension, including weight-0 qualitative ones', () => {
    const entry = extractVerdictLedgerEntry(baseCtx())
    expect(entry.dimension_scores).toHaveLength(3)
    const mfg = entry.dimension_scores.find(d => d.key === 'manufacturing')
    expect(mfg?.weight).toBe(0)
    expect(mfg?.qualitativeLevel).toBe('Medium')
    expect(mfg?.rawScore).toBeUndefined()
  })
})

describe('extractVerdictLedgerEntry — safety gate', () => {
  it('safety_gate_clean is true when no news_intelligence exists at all is FALSE (absence is not clean)', () => {
    const entry = extractVerdictLedgerEntry(baseCtx({ memo: baseMemo({ news_intelligence: undefined }) }))
    expect(entry.safety_gate_clean).toBe(false)
  })

  it('safety_gate_clean is true with zero recalls/adverse events and a successful openfda check', () => {
    const entry = extractVerdictLedgerEntry(baseCtx({
      memo: baseMemo({
        news_intelligence: { items: [{ provider: 'openfda' }], failedProviders: [] } as unknown as MemoData['news_intelligence'],
      }),
    }))
    expect(entry.safety_gate_clean).toBe(true)
  })

  it('safety_gate_tier is null when no safety override reason is present', () => {
    const entry = extractVerdictLedgerEntry(baseCtx({ grounded: baseGrounded({ verdictOverrideReasons: [] }) }))
    expect(entry.safety_gate_tier).toBeNull()
  })

  it('safety_gate_tier equals the final decision when a safety override reason is present', () => {
    const entry = extractVerdictLedgerEntry(baseCtx({
      grounded: baseGrounded({ decision: 'VALIDATE_FURTHER', verdictOverrideReasons: ['Safety gate overrode score-threshold verdict (VALIDATE_FURTHER).'] }),
    }))
    expect(entry.safety_gate_tier).toBe('VALIDATE_FURTHER')
  })
})

describe('extractVerdictLedgerEntry — future-milestone fields stay honestly null', () => {
  it('pillar_scores, pillar_confidence, lifecycle_stage, gap_velocity are always null in v1', () => {
    const entry = extractVerdictLedgerEntry(baseCtx())
    expect(entry.pillar_scores).toBeNull()
    expect(entry.pillar_confidence).toBeNull()
    expect(entry.lifecycle_stage).toBeNull()
    expect(entry.gap_velocity).toBeNull()
  })
})
