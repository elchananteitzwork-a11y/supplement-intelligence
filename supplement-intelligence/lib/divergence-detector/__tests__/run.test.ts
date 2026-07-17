import { describe, it, expect, vi, beforeEach } from 'vitest'

const getRecentObservations = vi.fn()
const writeDivergenceAlert = vi.fn()

vi.mock('../service-store', () => ({ getRecentObservations, writeDivergenceAlert }))

describe('lib/divergence-detector/run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is category-agnostic: takes candidate niche keys as a parameter, never imports a fixed list itself', async () => {
    getRecentObservations.mockResolvedValue([])
    const { runDivergenceDetection } = await import('../run')
    const result = await runDivergenceDetection(['some-beauty-niche', 'some-pets-niche'])
    expect(getRecentObservations).toHaveBeenCalledWith('some-beauty-niche')
    expect(getRecentObservations).toHaveBeenCalledWith('some-pets-niche')
    expect(result.candidatesChecked).toBe(2)
  })

  it('records a real alert only when a real divergence between two real series is detected', async () => {
    getRecentObservations.mockImplementation(async (nicheKey: string) => {
      if (nicheKey === 'berberine') {
        return [
          {
            source: 'science', metric: 'publication_velocity_pct',
            points: [
              { value: 10, observedAt: '2026-07-01T00:00:00Z' },
              { value: 40, observedAt: '2026-07-08T00:00:00Z' }, // +300%
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
      }
      return []
    })

    const { runDivergenceDetection } = await import('../run')
    const now = new Date('2026-07-14T08:00:00Z')
    const result = await runDivergenceDetection(['berberine', 'creatine'], now)

    expect(result).toEqual({ candidatesChecked: 2, seriesEvaluated: 2, alertsRecorded: 1 })
    expect(writeDivergenceAlert).toHaveBeenCalledTimes(1)
    expect(writeDivergenceAlert).toHaveBeenCalledWith({
      nicheKey: 'berberine',
      sourceA: 'science', metricA: 'publication_velocity_pct', priorValueA: 10, latestValueA: 40, changePctA: 300,
      sourceB: 'search_intent', metricB: 'search_volume', priorValueB: 1000, latestValueB: 600, changePctB: -40,
      divergencePct: 340,
      detectedAt: now,
    })
  })

  it('records zero alerts when a candidate has fewer than 2 real series (honest insufficient-data case)', async () => {
    getRecentObservations.mockResolvedValue([
      { source: 'science', metric: 'publication_velocity_pct', points: [{ value: 10, observedAt: '2026-07-08T00:00:00Z' }] },
    ])
    const { runDivergenceDetection } = await import('../run')
    const result = await runDivergenceDetection(['magnesium'])
    expect(result.alertsRecorded).toBe(0)
    expect(writeDivergenceAlert).not.toHaveBeenCalled()
  })

  it('records zero alerts when real series exist but move the same direction (real non-divergent case)', async () => {
    getRecentObservations.mockResolvedValue([
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
    ])
    const { runDivergenceDetection } = await import('../run')
    const result = await runDivergenceDetection(['nad+'])
    expect(result.alertsRecorded).toBe(0)
    expect(writeDivergenceAlert).not.toHaveBeenCalled()
  })

  it('uses pre-fetched series from observationsByNicheKey instead of self-fetching, when supplied for a candidate', async () => {
    const observationsByNicheKey = new Map([
      ['berberine', [
        {
          source: 'science', metric: 'publication_velocity_pct',
          points: [
            { value: 10, observedAt: '2026-07-01T00:00:00Z' },
            { value: 40, observedAt: '2026-07-08T00:00:00Z' }, // +300%
          ],
        },
        {
          source: 'search_intent', metric: 'search_volume',
          points: [
            { value: 1000, observedAt: '2026-07-01T00:00:00Z' },
            { value: 600, observedAt: '2026-07-08T00:00:00Z' }, // -40%
          ],
        },
      ]],
    ])

    const { runDivergenceDetection } = await import('../run')
    const now = new Date('2026-07-14T08:00:00Z')
    const result = await runDivergenceDetection(['berberine'], now, observationsByNicheKey)

    expect(getRecentObservations).not.toHaveBeenCalled()
    expect(result).toEqual({ candidatesChecked: 1, seriesEvaluated: 2, alertsRecorded: 1 })
    expect(writeDivergenceAlert).toHaveBeenCalledWith({
      nicheKey: 'berberine',
      sourceA: 'science', metricA: 'publication_velocity_pct', priorValueA: 10, latestValueA: 40, changePctA: 300,
      sourceB: 'search_intent', metricB: 'search_volume', priorValueB: 1000, latestValueB: 600, changePctB: -40,
      divergencePct: 340,
      detectedAt: now,
    })
  })

  it('falls back to self-fetching a candidate missing from observationsByNicheKey (never fabricates its series)', async () => {
    getRecentObservations.mockResolvedValue([])
    const observationsByNicheKey = new Map([['berberine', []]])

    const { runDivergenceDetection } = await import('../run')
    const result = await runDivergenceDetection(['berberine', 'creatine'], new Date(), observationsByNicheKey)

    expect(getRecentObservations).toHaveBeenCalledTimes(1)
    expect(getRecentObservations).toHaveBeenCalledWith('creatine')
    expect(result.candidatesChecked).toBe(2)
  })
})
