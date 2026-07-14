import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const order = vi.fn()
const eqSelect = vi.fn(() => ({ order }))
const select = vi.fn(() => ({ eq: eqSelect }))

const upsert = vi.fn()

const from = vi.fn((table: string) => {
  if (table === 'niche_timeseries') return { select }
  if (table === 'discovery_alerts') return { upsert }
  throw new Error(`unexpected table ${table}`)
})

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from })) }))

const ORIGINAL_ENV = { ...process.env }

describe('lib/discovery-engine/service-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })
  afterEach(() => { process.env = { ...ORIGINAL_ENV } })

  describe('getRecentObservations', () => {
    it('groups real rows by (source, metric) into distinct series', async () => {
      order.mockResolvedValue({
        data: [
          { source: 'science', metric: 'publication_velocity_pct', value: 10, observed_at: '2026-07-01T00:00:00Z' },
          { source: 'science', metric: 'publication_velocity_pct', value: 20, observed_at: '2026-07-08T00:00:00Z' },
          { source: 'science', metric: 'trial_registrations_count', value: 3, observed_at: '2026-07-08T00:00:00Z' },
        ],
        error: null,
      })
      const { getRecentObservations } = await import('../service-store')
      const series = await getRecentObservations('berberine')

      expect(series).toHaveLength(2)
      const velocitySeries = series.find(s => s.metric === 'publication_velocity_pct')
      expect(velocitySeries?.points).toEqual([
        { value: 10, observedAt: '2026-07-01T00:00:00Z' },
        { value: 20, observedAt: '2026-07-08T00:00:00Z' },
      ])
      expect(eqSelect).toHaveBeenCalledWith('niche_key', 'berberine')
    })

    it('returns [] (never fabricated) when there are no real rows', async () => {
      order.mockResolvedValue({ data: [], error: null })
      const { getRecentObservations } = await import('../service-store')
      expect(await getRecentObservations('sea moss')).toEqual([])
    })

    it('returns [] on a query error rather than throwing', async () => {
      order.mockResolvedValue({ data: null, error: { message: 'boom' } })
      const { getRecentObservations } = await import('../service-store')
      expect(await getRecentObservations('nad+')).toEqual([])
    })
  })

  describe('writeDiscoveryAlert', () => {
    it('upserts with the exact conflict target', async () => {
      upsert.mockResolvedValue({ error: null })
      const { writeDiscoveryAlert } = await import('../service-store')
      const detectedAt = new Date('2026-07-14T08:00:00Z')
      await writeDiscoveryAlert({ nicheKey: 'berberine', source: 'science', metric: 'publication_velocity_pct', priorValue: 10, latestValue: 20, changePct: 100, detectedAt })

      expect(upsert).toHaveBeenCalledWith(
        {
          niche_key: 'berberine', source: 'science', metric: 'publication_velocity_pct',
          prior_value: 10, latest_value: 20, change_pct: 100,
          detected_at: detectedAt.toISOString(),
        },
        { onConflict: 'niche_key,source,metric,detected_at' },
      )
    })

    it('never throws when the write fails', async () => {
      upsert.mockRejectedValue(new Error('network down'))
      const { writeDiscoveryAlert } = await import('../service-store')
      await expect(writeDiscoveryAlert({ nicheKey: 'creatine', source: 'science', metric: 'publication_velocity_pct', priorValue: 1, latestValue: 2, changePct: 100, detectedAt: new Date() })).resolves.toBeUndefined()
    })
  })
})
