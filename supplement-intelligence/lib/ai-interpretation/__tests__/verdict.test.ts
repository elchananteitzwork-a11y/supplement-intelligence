// Verdict utility tests:
//   AT-VERDICT-003: Verdict display text matches approved strings exactly
//   AT-VERDICT-004: Confidence qualifier shown for LOW/MODERATE, not HIGH

import { describe, it, expect } from 'vitest'
import {
  verdictDisplayText,
  verdictLabelFromScore,
  verdictLabelFromDecision,
  computeVerdictConfidence,
  buildConfidenceQualifier,
  VERDICT_DISPLAY_TEXT,
} from '../verdict'
import type { ConfidenceTier } from '../types'

// ── AT-VERDICT-003: Approved display strings ──────────────────────────────────

describe('verdictDisplayText — AT-VERDICT-003', () => {
  it('ENTRY_SUPPORTED returns exact approved string', () => {
    expect(verdictDisplayText('ENTRY_SUPPORTED')).toBe('The evidence supports market entry')
  })

  it('VALIDATION_REQUIRED returns exact approved string', () => {
    expect(verdictDisplayText('VALIDATION_REQUIRED')).toBe('The evidence requires validation before entry')
  })

  it('ENTRY_NOT_SUPPORTED returns exact approved string', () => {
    expect(verdictDisplayText('ENTRY_NOT_SUPPORTED')).toBe('The evidence does not support market entry')
  })

  it('display text never contains personal directive language', () => {
    for (const text of Object.values(VERDICT_DISPLAY_TEXT)) {
      expect(text).not.toMatch(/\byou should\b|\bwe recommend\b|\bbuild now\b|\bskip\b/i)
    }
  })

  it('display text uses "The evidence" framing (market assessment, not founder instruction)', () => {
    for (const text of Object.values(VERDICT_DISPLAY_TEXT)) {
      expect(text).toMatch(/^The evidence/)
    }
  })
})

// ── verdictLabelFromScore ─────────────────────────────────────────────────────

describe('verdictLabelFromScore', () => {
  it('score >= 65 → ENTRY_SUPPORTED', () => {
    expect(verdictLabelFromScore(75)).toBe('ENTRY_SUPPORTED')
    expect(verdictLabelFromScore(65)).toBe('ENTRY_SUPPORTED')
  })

  it('score 64.9 → VALIDATION_REQUIRED (boundary)', () => {
    expect(verdictLabelFromScore(64.9)).toBe('VALIDATION_REQUIRED')
  })

  it('score 40–64.9 → VALIDATION_REQUIRED', () => {
    expect(verdictLabelFromScore(52)).toBe('VALIDATION_REQUIRED')
    expect(verdictLabelFromScore(40)).toBe('VALIDATION_REQUIRED')
  })

  it('score 39.9 → ENTRY_NOT_SUPPORTED (boundary)', () => {
    expect(verdictLabelFromScore(39.9)).toBe('ENTRY_NOT_SUPPORTED')
  })

  it('score < 40 → ENTRY_NOT_SUPPORTED', () => {
    expect(verdictLabelFromScore(35)).toBe('ENTRY_NOT_SUPPORTED')
    expect(verdictLabelFromScore(0)).toBe('ENTRY_NOT_SUPPORTED')
  })
})

// ── verdictLabelFromDecision ──────────────────────────────────────────────────

describe('verdictLabelFromDecision', () => {
  it('BUILD_NOW → ENTRY_SUPPORTED', () => {
    expect(verdictLabelFromDecision('BUILD_NOW')).toBe('ENTRY_SUPPORTED')
  })

  it('VALIDATE_FURTHER → VALIDATION_REQUIRED', () => {
    expect(verdictLabelFromDecision('VALIDATE_FURTHER')).toBe('VALIDATION_REQUIRED')
  })

  it('CATEGORY_CREATION_CANDIDATE → VALIDATION_REQUIRED', () => {
    expect(verdictLabelFromDecision('CATEGORY_CREATION_CANDIDATE')).toBe('VALIDATION_REQUIRED')
  })

  it('SKIP → ENTRY_NOT_SUPPORTED', () => {
    expect(verdictLabelFromDecision('SKIP')).toBe('ENTRY_NOT_SUPPORTED')
  })
})

// ── computeVerdictConfidence ──────────────────────────────────────────────────

type CardMap = Record<string, { confidence: ConfidenceTier }>

function cards(overrides: CardMap = {}): CardMap {
  const defaults: CardMap = {
    demand:                   { confidence: 'HIGH' },
    market_accessibility:     { confidence: 'HIGH' },
    consumer_pain:            { confidence: 'HIGH' },
    virality:                 { confidence: 'HIGH' },
    manufacturing_feasibility: { confidence: 'HIGH' },
  }
  return { ...defaults, ...overrides }
}

describe('computeVerdictConfidence', () => {
  it('≥4 CONFIRMED, none LIMITED → HIGH', () => {
    expect(computeVerdictConfidence(cards())).toBe('HIGH')
  })

  it('consumer_pain absent → LOW (excluded signal)', () => {
    const { consumer_pain: _, ...rest } = cards()
    expect(computeVerdictConfidence(rest)).toBe('LOW')
  })

  it('consumer_pain MODERATE (thin corpus) → LOW', () => {
    expect(computeVerdictConfidence(cards({ consumer_pain: { confidence: 'MODERATE' } }))).toBe('LOW')
  })

  it('consumer_pain LOW → LOW', () => {
    expect(computeVerdictConfidence(cards({ consumer_pain: { confidence: 'LOW' } }))).toBe('LOW')
  })

  it('demand LIMITED → LOW', () => {
    expect(computeVerdictConfidence(cards({ demand: { confidence: 'LOW' } }))).toBe('LOW')
  })

  it('≥2 CONFIRMED/INDICATED, ≤1 LIMITED → MODERATE', () => {
    const m: CardMap = {
      demand:           { confidence: 'HIGH' },
      consumer_pain:    { confidence: 'HIGH' },
      market_accessibility: { confidence: 'MODERATE' },
      virality:         { confidence: 'LOW' },
    }
    expect(computeVerdictConfidence(m)).toBe('MODERATE')
  })

  it('< 2 CONFIRMED/INDICATED → LOW', () => {
    const m: CardMap = {
      demand:        { confidence: 'HIGH' },
      consumer_pain: { confidence: 'HIGH' },
      virality:      { confidence: 'LOW' },
      market_accessibility: { confidence: 'LOW' },
    }
    // 2 HIGH (demand, consumer_pain), 2 LOW — limited > 1 → LOW
    expect(computeVerdictConfidence(m)).toBe('LOW')
  })
})

// ── AT-VERDICT-004: Confidence qualifier display rules ────────────────────────

describe('buildConfidenceQualifier — AT-VERDICT-004', () => {
  it('HIGH confidence → qualifier is null (do not show)', () => {
    expect(buildConfidenceQualifier(cards())).toBeNull()
  })

  it('MODERATE confidence → qualifier is non-null', () => {
    const m: CardMap = {
      demand:           { confidence: 'HIGH' },
      consumer_pain:    { confidence: 'HIGH' },
      market_accessibility: { confidence: 'MODERATE' },
      virality:         { confidence: 'LOW' },
    }
    const q = buildConfidenceQualifier(m)
    expect(q).not.toBeNull()
    expect(typeof q).toBe('string')
    expect((q as string).length).toBeGreaterThan(0)
  })

  it('LOW confidence → qualifier is non-null', () => {
    const m: CardMap = {
      demand:        { confidence: 'HIGH' },
      consumer_pain: { confidence: 'MODERATE' },
    }
    const q = buildConfidenceQualifier(m)
    expect(q).not.toBeNull()
    expect(typeof q).toBe('string')
  })

  it('qualifier mentions count of confirmed signals (N)', () => {
    const m: CardMap = {
      demand:           { confidence: 'HIGH' },
      consumer_pain:    { confidence: 'MODERATE' }, // thin_corpus → LOW verdict_confidence
      market_accessibility: { confidence: 'MODERATE' },
    }
    // demand is the only HIGH signal → N = 1
    const q = buildConfidenceQualifier(m) as string
    expect(q).toContain('1 confirmed signal')
  })

  it('qualifier uses plural when N > 1', () => {
    const m: CardMap = {
      demand:           { confidence: 'HIGH' },
      market_accessibility: { confidence: 'HIGH' },
      consumer_pain:    { confidence: 'MODERATE' }, // thin_corpus → LOW
    }
    // demand + market_accessibility = 2 HIGH
    const q = buildConfidenceQualifier(m) as string
    expect(q).toContain('2 confirmed signals')
  })

  it('qualifier names consumer_pain exclusion when card is absent', () => {
    const { consumer_pain: _, ...rest } = cards({ demand: { confidence: 'HIGH' } })
    const q = buildConfidenceQualifier(rest) as string
    expect(q).toContain('Consumer pain assessment was not possible')
  })

  it('qualifier does NOT mention exclusion when consumer_pain card is present (even LOW)', () => {
    const m: CardMap = {
      demand:        { confidence: 'HIGH' },
      consumer_pain: { confidence: 'LOW' },
    }
    const q = buildConfidenceQualifier(m) as string
    expect(q).not.toContain('Consumer pain assessment')
  })

  it('qualifier starts with "Based on"', () => {
    const m: CardMap = {
      demand: { confidence: 'HIGH' },
      consumer_pain: { confidence: 'MODERATE' },
    }
    const q = buildConfidenceQualifier(m) as string
    expect(q).toMatch(/^Based on /)
  })
})
