// Regression tests — 2026-07-18 audit follow-up.
//
// Finding 2: the 'price' metric's format callback was `v => fmtN(v, '') ? ...
// : '—'` — fmtN never returns an empty string (it returns '—' for
// null/undefined, which is truthy), so the '—' branch was dead code and a
// missing median_price silently rendered as a fabricated "$0".
//
// Finding 6: trend_direction was declared `dir: 'higher'`, but
// getNumericRank's 'higher' case only handles `typeof val === 'number'`, so
// a string trend_direction always ranked null and could never show a
// "best in class" badge.

import { describe, it, expect } from 'vitest'
import { METRICS, getNumericRank, trendRank } from '../metrics'

describe('median price metric — Finding 2 regression', () => {
  const priceMetric = METRICS.find(m => m.id === 'price')!

  it('renders — (not a fabricated $0) when median_price is null', () => {
    expect(priceMetric.format(null)).toBe('—')
  })

  it('renders — when median_price is undefined', () => {
    expect(priceMetric.format(undefined as unknown as null)).toBe('—')
  })

  it('still formats a real median_price as a dollar figure', () => {
    expect(priceMetric.format(24.6)).toBe('$25')
    expect(priceMetric.format(0)).toBe('$0') // a real, measured $0 stays $0 — only null/undefined map to —
  })
})

describe('trend direction ranking — Finding 6 regression', () => {
  const trendMetric = METRICS.find(m => m.id === 'trend')!

  it('is declared with its own "trend" direction, not "higher" (which never ranks a string)', () => {
    expect(trendMetric.dir).toBe('trend')
  })

  it('parses real provider trend strings into a comparable rank', () => {
    // Real formats from lib/signal-engine/providers/google-trends.ts's
    // growthToTrendStr and keepa.ts's bsrDeltaYoY.
    expect(trendRank('+12% (recent trend)')).toBe(12)
    expect(trendRank('-8% (recent trend)')).toBe(-8)
    expect(trendRank('+15% YoY')).toBe(15)
    expect(trendRank('-8% YoY')).toBe(-8)
    expect(trendRank('Stable')).toBe(0)
  })

  it('returns null (no fabricated rank) for an unrecognized format', () => {
    expect(trendRank('event-driven spike')).toBeNull()
  })

  it('getNumericRank now ranks a real trend_direction string instead of always returning null', () => {
    expect(getNumericRank('trend', '+12% (recent trend)')).toBe(12)
    expect(getNumericRank('trend', 'Stable')).toBe(0)
    expect(getNumericRank('trend', null)).toBeNull()
  })

  it('under the old dir: "higher" declaration this metric could never produce a winner — confirm the fix actually changes ranking behavior', () => {
    // The pre-fix behavior: getNumericRank('higher', '+12%...') returns null
    // because typeof val !== 'number'. Confirm the new 'trend' case differs.
    expect(getNumericRank('higher', '+12% (recent trend)')).toBeNull()
    expect(getNumericRank('trend', '+12% (recent trend)')).not.toBeNull()
  })
})
