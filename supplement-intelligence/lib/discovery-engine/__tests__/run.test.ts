import { describe, it, expect, vi, beforeEach } from 'vitest'

const getRecentObservations = vi.fn()
const writeDiscoveryAlert = vi.fn()

vi.mock('../service-store', () => ({ getRecentObservations, writeDiscoveryAlert }))

describe('lib/discovery-engine/run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is category-agnostic: takes candidate niche keys as a parameter, never imports a fixed list itself', async () => {
    getRecentObservations.mockResolvedValue([])
    const { runDiscoveryDetection } = await import('../run')
    const result = await runDiscoveryDetection(['some-beauty-niche', 'some-pets-niche'])
    expect(getRecentObservations).toHaveBeenCalledWith('some-beauty-niche')
    expect(getRecentObservations).toHaveBeenCalledWith('some-pets-niche')
    expect(result.candidatesChecked).toBe(2)
  })

  it('records a real alert only for a series that actually crosses the acceleration threshold', async () => {
    getRecentObservations.mockImplementation(async (nicheKey: string) => {
      if (nicheKey === 'berberine') {
        return [
          {
            source: 'science', metric: 'publication_velocity_pct',
            points: [
              { value: 10, observedAt: '2026-07-01T00:00:00Z' },
              { value: 30, observedAt: '2026-07-08T00:00:00Z' },
            ],
          },
          {
            source: 'science', metric: 'trial_registrations_count',
            points: [
              { value: 5, observedAt: '2026-07-01T00:00:00Z' },
              { value: 5, observedAt: '2026-07-08T00:00:00Z' },
            ],
          },
        ]
      }
      return []
    })

    const { runDiscoveryDetection } = await import('../run')
    const now = new Date('2026-07-14T08:00:00Z')
    const result = await runDiscoveryDetection(['berberine', 'creatine'], now)

    expect(result).toEqual({ candidatesChecked: 2, seriesEvaluated: 2, alertsRecorded: 1 })
    expect(writeDiscoveryAlert).toHaveBeenCalledTimes(1)
    expect(writeDiscoveryAlert).toHaveBeenCalledWith({
      nicheKey: 'berberine', source: 'science', metric: 'publication_velocity_pct',
      priorValue: 10, latestValue: 30, changePct: 200, detectedAt: now,
    })
  })

  it('records zero alerts when no candidate has enough real history yet (honest cold start)', async () => {
    getRecentObservations.mockResolvedValue([
      { source: 'science', metric: 'publication_velocity_pct', points: [{ value: 10, observedAt: '2026-07-08T00:00:00Z' }] },
    ])
    const { runDiscoveryDetection } = await import('../run')
    const result = await runDiscoveryDetection(['magnesium'])
    expect(result.alertsRecorded).toBe(0)
    expect(writeDiscoveryAlert).not.toHaveBeenCalled()
  })

  it('uses pre-fetched series from observationsByNicheKey instead of self-fetching, when supplied for a candidate', async () => {
    const observationsByNicheKey = new Map([
      ['berberine', [
        {
          source: 'science', metric: 'publication_velocity_pct',
          points: [
            { value: 10, observedAt: '2026-07-01T00:00:00Z' },
            { value: 30, observedAt: '2026-07-08T00:00:00Z' },
          ],
        },
      ]],
    ])

    const { runDiscoveryDetection } = await import('../run')
    const now = new Date('2026-07-14T08:00:00Z')
    const result = await runDiscoveryDetection(['berberine'], now, observationsByNicheKey)

    expect(getRecentObservations).not.toHaveBeenCalled()
    expect(result).toEqual({ candidatesChecked: 1, seriesEvaluated: 1, alertsRecorded: 1 })
    expect(writeDiscoveryAlert).toHaveBeenCalledWith({
      nicheKey: 'berberine', source: 'science', metric: 'publication_velocity_pct',
      priorValue: 10, latestValue: 30, changePct: 200, detectedAt: now,
    })
  })

  it('falls back to self-fetching a candidate missing from observationsByNicheKey (never fabricates its series)', async () => {
    getRecentObservations.mockResolvedValue([])
    const observationsByNicheKey = new Map([['berberine', []]])

    const { runDiscoveryDetection } = await import('../run')
    const result = await runDiscoveryDetection(['berberine', 'creatine'], new Date(), observationsByNicheKey)

    expect(getRecentObservations).toHaveBeenCalledTimes(1)
    expect(getRecentObservations).toHaveBeenCalledWith('creatine')
    expect(result.candidatesChecked).toBe(2)
  })
})
