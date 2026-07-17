import { describe, it, expect } from 'vitest'
import { detectSeriesDivergence } from '../detector'
import type { NicheSeries } from '../service-store'

describe('lib/divergence-detector/detector', () => {
  it('returns null (insufficient real series) when fewer than 2 series have enough history for an acceleration reading', () => {
    const series: NicheSeries[] = [
      { source: 'science', metric: 'publication_velocity_pct', points: [{ value: 10, observedAt: '2026-07-08T00:00:00Z' }] }, // only 1 point
    ]
    expect(detectSeriesDivergence(series)).toBeNull()
  })

  it('returns null when zero series exist for the niche', () => {
    expect(detectSeriesDivergence([])).toBeNull()
  })

  it('detects a real divergence between two real series moving in opposite directions', () => {
    const series: NicheSeries[] = [
      {
        source: 'science', metric: 'publication_velocity_pct',
        points: [
          { value: 10, observedAt: '2026-07-01T00:00:00Z' },
          { value: 40, observedAt: '2026-07-08T00:00:00Z' }, // +200%
        ],
      },
      {
        source: 'search_intent', metric: 'search_volume',
        points: [
          { value: 1000, observedAt: '2026-07-01T00:00:00Z' },
          { value: 600, observedAt: '2026-07-08T00:00:00Z' }, // -40%
        ],
      },
    ]
    const result = detectSeriesDivergence(series)
    expect(result).toHaveLength(1)
    expect(result![0]).toMatchObject({
      sourceA: 'science', metricA: 'publication_velocity_pct', changePctA: 300,
      sourceB: 'search_intent', metricB: 'search_volume', changePctB: -40,
      divergencePct: 340,
    })
  })

  it('returns [] (a real comparison, not a missing one) when both real series move the same direction', () => {
    const series: NicheSeries[] = [
      {
        source: 'science', metric: 'publication_velocity_pct',
        points: [
          { value: 10, observedAt: '2026-07-01T00:00:00Z' },
          { value: 30, observedAt: '2026-07-08T00:00:00Z' }, // +200%
        ],
      },
      {
        source: 'search_intent', metric: 'search_volume',
        points: [
          { value: 1000, observedAt: '2026-07-01T00:00:00Z' },
          { value: 1500, observedAt: '2026-07-08T00:00:00Z' }, // +50%
        ],
      },
    ]
    expect(detectSeriesDivergence(series)).toEqual([])
  })

  it('ignores a series with fewer than 2 real points when combining with others (does not fabricate a reading for it)', () => {
    const series: NicheSeries[] = [
      {
        source: 'science', metric: 'publication_velocity_pct',
        points: [
          { value: 10, observedAt: '2026-07-01T00:00:00Z' },
          { value: 40, observedAt: '2026-07-08T00:00:00Z' },
        ],
      },
      {
        source: 'search_intent', metric: 'search_volume',
        points: [{ value: 1000, observedAt: '2026-07-08T00:00:00Z' }], // only 1 point, excluded
      },
    ]
    // only 1 real accelerating reading survives -> insufficient
    expect(detectSeriesDivergence(series)).toBeNull()
  })
})
