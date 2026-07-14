import { describe, it, expect } from 'vitest'
import { toSearchKeyword, broadenTrendsQuery } from '../trends-query-broadening'

describe('trends-query-broadening (Roadmap M2.14, extracted from google-trends.ts unchanged)', () => {
  it('strips "supplement(s)" and normalizes whitespace', () => {
    expect(toSearchKeyword('Berberine Supplements')).toBe('berberine')
    expect(toSearchKeyword('Magnesium  Glycinate   Supplement')).toBe('magnesium glycinate')
  })

  it('returns [] for an empty/whitespace-only query', () => {
    expect(broadenTrendsQuery('   ')).toEqual([])
  })

  it('produces progressively broader real candidates for a SKU-level query', () => {
    const candidates = broadenTrendsQuery('Collagen Peptide Gummies for Skin Support')
    expect(candidates.length).toBeGreaterThan(1)
    expect(candidates[0]).toContain('collagen')
    // The broadest candidate should be a single short, meaningful word.
    expect(candidates[candidates.length - 1].split(' ')).toHaveLength(1)
  })

  it('deduplicates candidates while preserving order', () => {
    const candidates = broadenTrendsQuery('Berberine')
    expect(new Set(candidates).size).toBe(candidates.length)
  })
})
