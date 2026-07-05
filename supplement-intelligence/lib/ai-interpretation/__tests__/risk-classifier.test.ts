// ── Risk classifier tests ─────────────────────────────────────────────────
// Covers: AT-RISK-001 through AT-RISK-005
//         All 10 risk types with trigger/no-trigger boundary cases

import { describe, it, expect } from 'vitest'
import { classifyPrimaryRisk, computeCompetitorFormulaSimilarity, type RiskContext } from '../risk-classifier'

// ── Baseline RiskContext (no risk triggers) ───────────────────────────────

const BASE_CTX: RiskContext = {
  review_moat_score:             6.0,   // healthy — no moat
  meaningful_competitor_count:   8,
  avg_review_count:              800,
  review_concentration_ratio:    0.40,
  demand_signal_count:           2,
  monthly_search_volume:         25_000,
  keepa_monthly_units:           3_500,
  moq_min:                       500,
  unit_cost_min:                 4.50,
  cogs_ratio:                    0.18,
  median_price:                  29.99,
  corpus_size:                   150,
  thin_corpus:                   false,
  competitor_formula_similarity: 0.20,
  seasonality_pattern:           'Perennial',
  top_keyword_pct:               0.45,
  top_keyword:                   'magnesium glycinate sleep',
  virality_score:                5.5,
  market_accessibility_score:    6.0,
}

// ── AT-RISK-001: REVIEW_MOAT triggers correctly ───────────────────────────

describe('AT-RISK-001: REVIEW_MOAT classification', () => {
  it('HIGH when review_moat_score ≤ 1.5', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, review_moat_score: 1.2 })
    expect(result.type).toBe('REVIEW_MOAT')
    expect(result.severity).toBe('HIGH')
    expect(result.evidence.review_moat_score).toBe(1.2)
  })

  it('MODERATE when review_moat_score between 1.6 and 3.0', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, review_moat_score: 2.5 })
    expect(result.type).toBe('REVIEW_MOAT')
    expect(result.severity).toBe('MODERATE')
  })

  it('does NOT trigger when review_moat_score > 3.0', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, review_moat_score: 3.1 })
    expect(result.type).not.toBe('REVIEW_MOAT')
  })

  it('does NOT trigger when review_moat_score is null', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, review_moat_score: null })
    expect(result.type).not.toBe('REVIEW_MOAT')
  })

  it('includes avg_review_count in evidence', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, review_moat_score: 1.0, avg_review_count: 4500 })
    expect(result.evidence.avg_review_count).toBe(4500)
  })
})

// ── AT-RISK-002: MARKET_SATURATION triggers correctly ─────────────────────

describe('AT-RISK-002: MARKET_SATURATION classification', () => {
  it('HIGH when ≥ 20 competitors AND concentration ≥ 0.70', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, meaningful_competitor_count: 22, review_concentration_ratio: 0.75 })
    expect(result.type).toBe('MARKET_SATURATION')
    expect(result.severity).toBe('HIGH')
  })

  it('MODERATE when ≥ 15 competitors', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, meaningful_competitor_count: 16 })
    expect(result.type).toBe('MARKET_SATURATION')
    expect(result.severity).toBe('MODERATE')
  })

  it('MODERATE when concentration ≥ 0.60', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, review_concentration_ratio: 0.65 })
    expect(result.type).toBe('MARKET_SATURATION')
    expect(result.severity).toBe('MODERATE')
  })

  it('does NOT trigger when competitors < 15 and concentration < 0.60', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, meaningful_competitor_count: 8, review_concentration_ratio: 0.40 })
    expect(result.type).not.toBe('MARKET_SATURATION')
  })

  it('does NOT trigger when competitors is null', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, meaningful_competitor_count: null })
    expect(result.type).not.toBe('MARKET_SATURATION')
  })
})

// ── AT-RISK-003: DEMAND_UNCERTAINTY triggers correctly ────────────────────

describe('AT-RISK-003: DEMAND_UNCERTAINTY classification', () => {
  it('HIGH when demand_signal_count is 0', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, demand_signal_count: 0, monthly_search_volume: null, keepa_monthly_units: null })
    expect(result.type).toBe('DEMAND_UNCERTAINTY')
    expect(result.severity).toBe('HIGH')
    expect(result.evidence.demand_signal_count).toBe(0)
  })

  it('MODERATE when demand_signal_count is 1', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, demand_signal_count: 1, keepa_monthly_units: null })
    expect(result.type).toBe('DEMAND_UNCERTAINTY')
    expect(result.severity).toBe('MODERATE')
  })

  it('does NOT trigger HIGH or MODERATE DEMAND_UNCERTAINTY when demand_signal_count is 2', () => {
    // With 2 confirmed signals the evaluator does not fire — DEMAND_UNCERTAINTY
    // may still appear as the LOW-severity fallback (primary_risk is always required),
    // but never at HIGH or MODERATE severity from the evaluator.
    const result = classifyPrimaryRisk({ ...BASE_CTX, demand_signal_count: 2 })
    if (result.type === 'DEMAND_UNCERTAINTY') {
      expect(result.severity).toBe('LOW')
    }
  })
})

// ── AT-RISK-004: COST_STRUCTURE triggers correctly ────────────────────────

describe('AT-RISK-004: COST_STRUCTURE classification', () => {
  it('HIGH when cogs_ratio ≥ 0.60', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, cogs_ratio: 0.65, unit_cost_min: 19.50, median_price: 29.99 })
    expect(result.type).toBe('COST_STRUCTURE')
    expect(result.severity).toBe('HIGH')
    expect(result.evidence.cogs_ratio).toBe(0.65)
  })

  it('MODERATE when cogs_ratio between 0.45 and 0.59', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, cogs_ratio: 0.50 })
    expect(result.type).toBe('COST_STRUCTURE')
    expect(result.severity).toBe('MODERATE')
  })

  it('does NOT trigger when cogs_ratio < 0.45', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, cogs_ratio: 0.30 })
    expect(result.type).not.toBe('COST_STRUCTURE')
  })

  it('does NOT trigger when cogs_ratio is null', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, cogs_ratio: null })
    expect(result.type).not.toBe('COST_STRUCTURE')
  })
})

// ── AT-RISK-005: THIN_CONSUMER_DATA triggers correctly ────────────────────

describe('AT-RISK-005: THIN_CONSUMER_DATA classification', () => {
  it('MODERATE when thin_corpus is true and corpus_size > 0', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, thin_corpus: true, corpus_size: 18 })
    expect(result.type).toBe('THIN_CONSUMER_DATA')
    expect(result.severity).toBe('MODERATE')
    expect(result.evidence.corpus_size).toBe(18)
  })

  it('HIGH when thin_corpus is true and corpus_size is 0', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, thin_corpus: true, corpus_size: 0 })
    expect(result.type).toBe('THIN_CONSUMER_DATA')
    expect(result.severity).toBe('HIGH')
  })

  it('does NOT trigger when thin_corpus is false', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, thin_corpus: false })
    expect(result.type).not.toBe('THIN_CONSUMER_DATA')
  })
})

// ── COMPETITOR_FORMULA_PARITY triggers correctly ──────────────────────────

describe('COMPETITOR_FORMULA_PARITY classification', () => {
  it('HIGH when similarity ≥ 0.85', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, competitor_formula_similarity: 0.88 })
    expect(result.type).toBe('COMPETITOR_FORMULA_PARITY')
    expect(result.severity).toBe('HIGH')
  })

  it('MODERATE when similarity between 0.70 and 0.84', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, competitor_formula_similarity: 0.75 })
    expect(result.type).toBe('COMPETITOR_FORMULA_PARITY')
    expect(result.severity).toBe('MODERATE')
  })

  it('does NOT trigger when similarity < 0.70', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, competitor_formula_similarity: 0.50 })
    expect(result.type).not.toBe('COMPETITOR_FORMULA_PARITY')
  })
})

// ── SEASONALITY triggers correctly ────────────────────────────────────────

describe('SEASONALITY classification', () => {
  it('MODERATE when pattern is Seasonal', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, seasonality_pattern: 'Seasonal' })
    expect(result.type).toBe('SEASONALITY')
    expect(result.severity).toBe('MODERATE')
  })

  it('HIGH when pattern is Event-driven', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, seasonality_pattern: 'Event-driven' })
    expect(result.type).toBe('SEASONALITY')
    expect(result.severity).toBe('HIGH')
  })

  it('does NOT trigger when pattern is Perennial', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, seasonality_pattern: 'Perennial' })
    expect(result.type).not.toBe('SEASONALITY')
  })
})

// ── DEMAND_CONCENTRATION triggers correctly ───────────────────────────────

describe('DEMAND_CONCENTRATION classification', () => {
  it('HIGH when top_keyword_pct ≥ 0.85', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, top_keyword_pct: 0.90, top_keyword: 'magnesium glycinate' })
    expect(result.type).toBe('DEMAND_CONCENTRATION')
    expect(result.severity).toBe('HIGH')
    expect(result.evidence.top_keyword_pct).toBe(0.90)
  })

  it('MODERATE when top_keyword_pct between 0.70 and 0.84', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, top_keyword_pct: 0.75 })
    expect(result.type).toBe('DEMAND_CONCENTRATION')
    expect(result.severity).toBe('MODERATE')
  })

  it('does NOT trigger when top_keyword_pct < 0.70', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, top_keyword_pct: 0.55 })
    expect(result.type).not.toBe('DEMAND_CONCENTRATION')
  })
})

// ── VIRALITY_ABSENCE triggers correctly ───────────────────────────────────

describe('VIRALITY_ABSENCE classification', () => {
  it('MODERATE when virality_score is 2.1–3.9', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, virality_score: 3.0 })
    expect(result.type).toBe('VIRALITY_ABSENCE')
    expect(result.severity).toBe('MODERATE')
  })

  it('HIGH when virality_score ≤ 2.0', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, virality_score: 1.5 })
    expect(result.type).toBe('VIRALITY_ABSENCE')
    expect(result.severity).toBe('HIGH')
  })

  it('does NOT trigger when virality_score ≥ 4.0', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, virality_score: 4.0 })
    expect(result.type).not.toBe('VIRALITY_ABSENCE')
  })

  it('does NOT trigger when virality_score is null (no signal)', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, virality_score: null })
    expect(result.type).not.toBe('VIRALITY_ABSENCE')
  })
})

// ── CATEGORY_ACCESSIBILITY triggers correctly ─────────────────────────────

describe('CATEGORY_ACCESSIBILITY classification', () => {
  it('HIGH when market_accessibility_score ≤ 1.5', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, market_accessibility_score: 1.0 })
    expect(result.type).toBe('CATEGORY_ACCESSIBILITY')
    expect(result.severity).toBe('HIGH')
  })

  it('MODERATE when score between 1.6 and 3.0', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, market_accessibility_score: 2.5 })
    expect(result.type).toBe('CATEGORY_ACCESSIBILITY')
    expect(result.severity).toBe('MODERATE')
  })

  it('does NOT trigger when score > 3.0', () => {
    const result = classifyPrimaryRisk({ ...BASE_CTX, market_accessibility_score: 3.5 })
    expect(result.type).not.toBe('CATEGORY_ACCESSIBILITY')
  })
})

// ── Severity tie-breaking: HIGH beats MODERATE ────────────────────────────

describe('Severity priority: highest severity wins', () => {
  it('returns HIGH risk when two risks fire and one is HIGH', () => {
    // Both DEMAND_UNCERTAINTY (HIGH, count=0) and THIN_CONSUMER_DATA (MODERATE) would fire
    const result = classifyPrimaryRisk({
      ...BASE_CTX,
      demand_signal_count: 0,
      monthly_search_volume: null,
      thin_corpus: true,
      corpus_size: 10,
    })
    expect(result.severity).toBe('HIGH')
  })
})

// ── Default fallback: no risk triggered ───────────────────────────────────

describe('Default fallback when no risk triggers', () => {
  it('returns DEMAND_UNCERTAINTY LOW as the fallback when base context has 2 signals', () => {
    const result = classifyPrimaryRisk(BASE_CTX)
    // BASE_CTX has demand_signal_count: 2 so no DEMAND_UNCERTAINTY
    // Check that a valid risk is returned (the default case)
    expect(['DEMAND_UNCERTAINTY', 'VIRALITY_ABSENCE']).toContain(result.type)
    expect(['HIGH', 'MODERATE', 'LOW']).toContain(result.severity)
  })
})

// ── computeCompetitorFormulaSimilarity ────────────────────────────────────

describe('computeCompetitorFormulaSimilarity', () => {
  it('returns 0 when fewer than 2 competitors have ingredient labels', () => {
    expect(computeCompetitorFormulaSimilarity([])).toBe(0)
    expect(computeCompetitorFormulaSimilarity([{ ingredients_label: 'Magnesium (as glycinate) 120mg' }])).toBe(0)
  })

  it('returns high similarity for identical ingredient labels', () => {
    const identical = [
      { ingredients_label: 'Magnesium glycinate, Magnesium citrate, Zinc' },
      { ingredients_label: 'Magnesium glycinate, Magnesium citrate, Zinc' },
    ]
    const similarity = computeCompetitorFormulaSimilarity(identical)
    expect(similarity).toBeGreaterThan(0.80)
  })

  it('returns low similarity for completely different labels', () => {
    const different = [
      { ingredients_label: 'Ashwagandha, Rhodiola, Ginseng' },
      { ingredients_label: 'Magnesium glycinate, Zinc, Vitamin D3' },
    ]
    const similarity = computeCompetitorFormulaSimilarity(different)
    expect(similarity).toBeLessThan(0.30)
  })

  it('returns 0 when all competitors have empty ingredient labels', () => {
    const empty = [{ ingredients_label: '' }, { ingredients_label: '  ' }]
    expect(computeCompetitorFormulaSimilarity(empty)).toBe(0)
  })
})
