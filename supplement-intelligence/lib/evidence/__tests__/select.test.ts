// First-screen signal selection tests:
//   AT-SIG-001: verdict-conditional selection
//   AT-SIG-002: tie-breaking by dimension weight

import { describe, it, expect } from 'vitest'
import { selectFirstScreenSignals, SIGNAL_WEIGHTS } from '../select'
import type { SynthesisSignal, VerdictLabel } from '@/lib/ai-interpretation/types'

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeSignal(id: string, score: number): SynthesisSignal {
  return {
    id:              id as SynthesisSignal['id'],
    display_label:   id,
    score,
    confidence:      'MODERATE',
    headline:        'test',
    supporting_stat: '—',
  }
}

// Seven signals with distinct scores
const SIGNALS_7: SynthesisSignal[] = [
  makeSignal('demand',                   8.5),
  makeSignal('profitability',            7.2),
  makeSignal('market_accessibility',     6.8),
  makeSignal('consumer_pain',            5.4),
  makeSignal('virality',                 4.1),
  makeSignal('subscription_potential',   3.0),
  makeSignal('manufacturing_feasibility', 2.2),
]

// ── AT-SIG-001: Verdict-conditional selection ─────────────────────────────

describe('selectFirstScreenSignals — AT-SIG-001', () => {
  it('ENTRY_SUPPORTED: returns 3 highest-scored signals', () => {
    const result = selectFirstScreenSignals(SIGNALS_7, 'ENTRY_SUPPORTED')
    expect(result).toHaveLength(3)
    const ids = result.map(s => s.id)
    expect(ids).toContain('demand')
    expect(ids).toContain('profitability')
    expect(ids).toContain('market_accessibility')
  })

  it('ENTRY_SUPPORTED: result is ordered highest-first', () => {
    const result = selectFirstScreenSignals(SIGNALS_7, 'ENTRY_SUPPORTED')
    expect(result[0].id).toBe('demand')
    expect(result[1].id).toBe('profitability')
    expect(result[2].id).toBe('market_accessibility')
  })

  it('VALIDATION_REQUIRED: returns highest + two lowest', () => {
    const result = selectFirstScreenSignals(SIGNALS_7, 'VALIDATION_REQUIRED')
    expect(result).toHaveLength(3)
    const ids = result.map(s => s.id)
    // Highest
    expect(ids).toContain('demand')
    // Two lowest
    expect(ids).toContain('manufacturing_feasibility')
    expect(ids).toContain('subscription_potential')
  })

  it('VALIDATION_REQUIRED: highest is always index 0', () => {
    const result = selectFirstScreenSignals(SIGNALS_7, 'VALIDATION_REQUIRED')
    expect(result[0].id).toBe('demand')
  })

  it('ENTRY_NOT_SUPPORTED: returns 3 lowest-scored signals', () => {
    const result = selectFirstScreenSignals(SIGNALS_7, 'ENTRY_NOT_SUPPORTED')
    expect(result).toHaveLength(3)
    const ids = result.map(s => s.id)
    expect(ids).toContain('manufacturing_feasibility')
    expect(ids).toContain('subscription_potential')
    expect(ids).toContain('virality')
  })

  it('ENTRY_NOT_SUPPORTED: result is ordered lowest-first', () => {
    const result = selectFirstScreenSignals(SIGNALS_7, 'ENTRY_NOT_SUPPORTED')
    expect(result[0].id).toBe('manufacturing_feasibility')
    expect(result[1].id).toBe('subscription_potential')
  })

  it('returns all signals when fewer than 3 present', () => {
    const two = [makeSignal('demand', 7.0), makeSignal('virality', 3.0)]
    const result = selectFirstScreenSignals(two, 'ENTRY_SUPPORTED')
    expect(result).toHaveLength(2)
  })

  it('returns all signals when exactly 3 present', () => {
    const three = SIGNALS_7.slice(0, 3)
    const result = selectFirstScreenSignals(three, 'ENTRY_NOT_SUPPORTED')
    expect(result).toHaveLength(3)
  })
})

// ── AT-SIG-002: Tie-breaking by dimension weight ──────────────────────────

describe('selectFirstScreenSignals — AT-SIG-002 (tie-breaking)', () => {
  it('ENTRY_SUPPORTED: breaks score ties by weight (higher weight wins)', () => {
    // consumer_pain (weight 18) and market_accessibility (weight 18) both at 6.0
    // virality (weight 10) also at 6.0
    // demand (8.0) is clear top
    const tied: SynthesisSignal[] = [
      makeSignal('demand',               8.0),
      makeSignal('profitability',        7.0),
      makeSignal('market_accessibility', 6.0),
      makeSignal('consumer_pain',        6.0),
      makeSignal('virality',             6.0),
    ]
    const result = selectFirstScreenSignals(tied, 'ENTRY_SUPPORTED')
    expect(result).toHaveLength(3)
    const ids = result.map(s => s.id)
    // Among tied-at-6.0: market_accessibility (18) and consumer_pain (18) beat virality (10)
    expect(ids).toContain('demand')
    expect(ids).toContain('profitability')
    // Either market_accessibility or consumer_pain in slot 3 (same weight — either is valid)
    expect(ids.some(id => id === 'market_accessibility' || id === 'consumer_pain')).toBe(true)
    expect(ids).not.toContain('virality')
  })

  it('ENTRY_NOT_SUPPORTED: breaks score ties by weight (lower weight first)', () => {
    // All signals tied at 3.0 — lower weight should appear first
    const allTied: SynthesisSignal[] = [
      makeSignal('demand',                   3.0),
      makeSignal('profitability',            3.0),
      makeSignal('market_accessibility',     3.0),
      makeSignal('consumer_pain',            3.0),
      makeSignal('virality',                 3.0),
      makeSignal('subscription_potential',   3.0),
      makeSignal('manufacturing_feasibility', 3.0),
    ]
    const result = selectFirstScreenSignals(allTied, 'ENTRY_NOT_SUPPORTED')
    expect(result).toHaveLength(3)
    // manufacturing_feasibility (5), subscription_potential (7), virality (10) should be first
    const ids = result.map(s => s.id)
    expect(ids).toContain('manufacturing_feasibility')
    expect(ids).toContain('subscription_potential')
    expect(ids).toContain('virality')
  })

  it('SIGNAL_WEIGHTS covers all 7 signal ids', () => {
    const expectedIds = [
      'demand', 'profitability', 'market_accessibility', 'consumer_pain',
      'virality', 'subscription_potential', 'manufacturing_feasibility',
    ]
    for (const id of expectedIds) {
      expect(SIGNAL_WEIGHTS[id]).toBeGreaterThan(0)
    }
  })

  it('SIGNAL_WEIGHTS weights sum to 100', () => {
    const total = Object.values(SIGNAL_WEIGHTS).reduce((acc, w) => acc + w, 0)
    expect(total).toBe(100)
  })
})
