// Regression tests — 2026-07-18 audit follow-up.
//
// Finding 1 (Critical): review_concentration is a real 0–1 ratio (confirmed
// by lib/stage25/launch-threshold.ts's `Math.round(concentration * 100)`),
// but the old fmtN(v, '', '%') call site never multiplied by 100, so an 85%
// concentration reached the AI model as the string "0.85%" — two orders of
// magnitude too small, and the prompt explicitly forbids the model from
// questioning or recalculating any value.
//
// Finding 3: fee_data_source was never read/passed through, so an estimated
// breakeven_cogs figure was presented identically to a measured one.
//
// Finding 4: signal_created_at was computed but never surfaced to the model.
//
// Finding 5: data_confidence was computed but discarded before the AI saw it.
//
// Finding 9: fmtK was missing the >= 1_000_000 branch page.tsx's version has.

import { describe, it, expect } from 'vitest'
import { fmtN, fmtK, fmtRatioPct, fmtDataAge, buildComparisonTable } from '../format'
import type { ComparisonItem } from '../../route'

function baseItem(overrides: Partial<ComparisonItem> = {}): ComparisonItem {
  return {
    thesis_id:            't1',
    signal_id:            's1',
    product_angle:        'Test product',
    target_customer:      'Test customer',
    differentiation:      'Test differentiation',
    category_id:          'supplements',
    signal_created_at:    new Date().toISOString(),
    stage:                'stage2',
    market_revenue_mo:    null,
    competitor_count:     null,
    review_concentration: null,
    median_price:         null,
    momentum_90d_pct:     null,
    trend_direction:      null,
    tiktok_view_count:    null,
    data_confidence:      null,
    min_capital_required: 5000,
    launch_complexity:    'medium',
    margin_viable:        true,
    complexity_drivers:   [],
    threshold_pass_count: 3,
    threshold_overall:    'pass',
    all_switches_clear:   null,
    triggered_switches:   [],
    verdict_code:         null,
    verdict_headline:     null,
    founder_verdict_code: null,
    breakeven_cogs:       null,
    base_price:           null,
    year1_base:           null,
    base_monthly:         null,
    fee_data_source:      null,
    fit_rank:             null,
    capital_fit_level:    null,
    channel_fit_level:    null,
    timeline_fit_level:   null,
    opportunity_score:    50,
    ...overrides,
  }
}

describe('fmtRatioPct — Finding 1 (Critical) regression', () => {
  it('multiplies a real 0-1 ratio by 100 instead of leaving it two orders of magnitude too small', () => {
    expect(fmtRatioPct(0.85)).toBe('85%')
    expect(fmtRatioPct(1)).toBe('100%')
    expect(fmtRatioPct(0)).toBe('0%')
  })

  it('returns N/A (never a fabricated 0%) when concentration is absent', () => {
    expect(fmtRatioPct(null)).toBe('N/A')
  })
})

describe('buildComparisonTable — Finding 1 (Critical) end-to-end', () => {
  it('emits the correctly-scaled review concentration row, not the old "0.85%" bug', () => {
    const table = buildComparisonTable([
      baseItem({ review_concentration: 0.85 }),
      baseItem({ review_concentration: 0.2 }),
    ])
    const revConcRow = table.split('\n').find(r => r.startsWith('Review Concentration'))!
    expect(revConcRow).toContain('85%')
    expect(revConcRow).toContain('20%')
    expect(revConcRow).not.toContain('0.85%')
    expect(revConcRow).not.toContain('0.2%')
  })
})

describe('buildComparisonTable — Finding 3 (fee_data_source) regression', () => {
  it('marks breakeven_cogs with "(est.)" when fee_data_source is estimated', () => {
    const table = buildComparisonTable([
      baseItem({ breakeven_cogs: 12.5, fee_data_source: 'estimated' }),
      baseItem({ breakeven_cogs: 9.0, fee_data_source: 'real' }),
    ])
    const cogsRow = table.split('\n').find(r => r.startsWith('Breakeven COGS'))!
    const cells = cogsRow.split('|').slice(1).map(c => c.trim())
    expect(cells[0]).toBe('$12.5 (est.)') // fmtN uses toLocaleString, not rounding
    expect(cells[1]).toBe('$9')
    expect(cells[1]).not.toContain('(est.)')
  })

  it('does not mark breakeven_cogs when fee_data_source is real or null', () => {
    const table = buildComparisonTable([
      baseItem({ breakeven_cogs: 9.0, fee_data_source: 'real' }),
      baseItem({ breakeven_cogs: null, fee_data_source: null }),
    ])
    const cogsRow = table.split('\n').find(r => r.startsWith('Breakeven COGS'))!
    expect(cogsRow).not.toContain('(est.)')
  })
})

describe('buildComparisonTable — Finding 4 (data age) regression', () => {
  it('includes a real Data Age row derived from signal_created_at', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString()
    const table = buildComparisonTable([
      baseItem({ signal_created_at: tenDaysAgo }),
      baseItem({ signal_created_at: new Date().toISOString() }),
    ])
    const ageRow = table.split('\n').find(r => r.startsWith('Data Age'))!
    expect(ageRow).toContain('10d')
    expect(ageRow).toContain('0d')
  })
})

describe('buildComparisonTable — Finding 5 (data confidence) regression', () => {
  it('includes a real Data Confidence row instead of discarding overall_confidence', () => {
    const table = buildComparisonTable([
      baseItem({ data_confidence: 0.72 }),
      baseItem({ data_confidence: null }),
    ])
    const confRow = table.split('\n').find(r => r.startsWith('Data Confidence'))!
    expect(confRow).toContain('72%')
    expect(confRow).toContain('N/A')
  })
})

describe('buildComparisonTable — opportunity_score null handling (Finding 7 downstream)', () => {
  it('renders N/A instead of a fabricated value when opportunity_score is null', () => {
    const table = buildComparisonTable([
      baseItem({ opportunity_score: null }),
      baseItem({ opportunity_score: 42 }),
    ])
    const scoreRow = table.split('\n').find(r => r.startsWith('Opportunity Score'))!
    const cells = scoreRow.split('|').slice(1).map(c => c.trim())
    expect(cells[0]).toBe('N/A')
    expect(cells[1]).toBe('42')
  })
})

describe('fmtK — Finding 9 regression', () => {
  it('formats values >= $1M with an M suffix instead of e.g. "$2400.0k"', () => {
    expect(fmtK(2_400_000)).toBe('$2.4M')
    expect(fmtK(1_000_000)).toBe('$1.0M')
  })

  it('still formats sub-$1M values with a k suffix', () => {
    expect(fmtK(2400)).toBe('$2k')
    expect(fmtK(999_999)).toBe('$1000k')
  })

  it('formats sub-$1000 values as plain dollars', () => {
    expect(fmtK(500)).toBe('$500')
  })

  it('returns N/A for null', () => {
    expect(fmtK(null)).toBe('N/A')
  })
})

describe('fmtN — unchanged baseline behavior', () => {
  it('applies prefix/suffix and locale formatting', () => {
    expect(fmtN(1234, '$')).toBe('$1,234')
    expect(fmtN(null)).toBe('N/A')
  })
})

describe('fmtDataAge', () => {
  it('returns N/A for an unparseable date rather than a fabricated age', () => {
    expect(fmtDataAge('not-a-date')).toBe('N/A')
  })
})
