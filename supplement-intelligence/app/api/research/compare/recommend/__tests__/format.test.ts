// Rewritten (2026-07-2x) for AnalysisComparisonItem (real `analyses`
// pipeline). Preserves the SPIRIT of the original 2026-07-18 audit
// regressions that still apply to the surviving fields:
//
// Finding 1 (Critical): review_concentration is a real 0-1 ratio and must be
// scaled ×100, not passed through as a raw fraction.
//
// Finding 4: signal age (now created_at) must reach the model.
//
// Finding 5: confidence (now confidencePct, already an integer percent) must
// reach the model, not be discarded.
//
// Finding 9: fmtK must format >= $1M with an "M" suffix.
//
// Dropped (no longer applicable): the old Finding 3 (fee_data_source "(est.)"
// marking) and Finding 7 (opportunity_score fabricated-0 regression) —
// AnalysisComparisonItem carries no unit-economics/fee fields at all, and
// `score` (lib/scoring.ts's GroundedScore.score) is always a real computed
// number, never nullable, so there is no "fabricated 0" case left to guard.

import { describe, it, expect } from 'vitest'
import { fmtN, fmtK, fmtRatioPct, fmtDataAge, buildComparisonTable } from '../format'
import type { AnalysisComparisonItem } from '../../route'

function baseItem(overrides: Partial<AnalysisComparisonItem> = {}): AnalysisComparisonItem {
  return {
    analysis_id:   'a1',
    category_name: 'Test product',
    created_at:    new Date().toISOString(),

    score:                50,
    decision:             'VALIDATE_FURTHER',
    insufficientEvidence: false,
    confidencePct:        null,

    verdict:     null,
    qualityTier: null,

    market_revenue_mo:    null,
    competitor_count:     null,
    review_concentration: null,
    median_price:         null,
    momentum_90d_pct:     null,
    trend_direction:      null,
    tiktok_view_count:    null,

    kill_criteria_clear:     null,
    triggered_kill_criteria: [],
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

describe('buildComparisonTable — Finding 4 (data age) regression', () => {
  it('includes a real Data Age row derived from created_at', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString()
    const table = buildComparisonTable([
      baseItem({ created_at: tenDaysAgo }),
      baseItem({ created_at: new Date().toISOString() }),
    ])
    const ageRow = table.split('\n').find(r => r.startsWith('Data Age'))!
    expect(ageRow).toContain('10d')
    expect(ageRow).toContain('0d')
  })
})

describe('buildComparisonTable — Finding 5 (data confidence) regression', () => {
  it('includes a real Data Confidence row instead of discarding confidencePct', () => {
    const table = buildComparisonTable([
      baseItem({ confidencePct: 72 }),
      baseItem({ confidencePct: null }),
    ])
    const confRow = table.split('\n').find(r => r.startsWith('Data Confidence'))!
    expect(confRow).toContain('72%')
    expect(confRow).toContain('N/A')
  })
})

describe('buildComparisonTable — verdict/qualityTier null handling', () => {
  it('renders N/A instead of a fabricated verdict when verdict/qualityTier are null', () => {
    const table = buildComparisonTable([
      baseItem({ verdict: null, qualityTier: null }),
      baseItem({ verdict: 'BUILD_NOW', qualityTier: 'High' }),
    ])
    const verdictRow = table.split('\n').find(r => r.startsWith('Market Verdict'))!
    const cells = verdictRow.split('|').slice(1).map(c => c.trim())
    expect(cells[0]).toBe('N/A')
    expect(cells[1]).toBe('BUILD_NOW')
  })
})

describe('buildComparisonTable — Kill Criteria Clear row', () => {
  it('renders N/A when never checked, Yes when clear, No + real triggered labels when flagged', () => {
    const table = buildComparisonTable([
      baseItem({ kill_criteria_clear: null }),
      baseItem({ kill_criteria_clear: true }),
      baseItem({ kill_criteria_clear: false, triggered_kill_criteria: ['Gap velocity turns negative'] }),
    ])
    const row = table.split('\n').find(r => r.startsWith('Kill Criteria Clear'))!
    const cells = row.split('|').slice(1).map(c => c.trim())
    expect(cells[0]).toBe('N/A')
    expect(cells[1]).toBe('Yes')
    expect(cells[2]).toBe('No (Gap velocity turns negative)')
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
