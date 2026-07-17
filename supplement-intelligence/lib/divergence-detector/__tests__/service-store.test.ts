import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const order = vi.fn()
const eqSelect = vi.fn(() => ({ order }))
const select = vi.fn(() => ({ eq: eqSelect }))

const upsert = vi.fn()

const from = vi.fn((table: string) => {
  if (table === 'niche_timeseries') return { select }
  if (table === 'divergence_alerts') return { upsert }
  throw new Error(`unexpected table ${table}`)
})

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from })) }))

const ORIGINAL_ENV = { ...process.env }

describe('lib/divergence-detector/service-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })
  afterEach(() => { process.env = { ...ORIGINAL_ENV } })

  describe('getRecentObservations (reused from lib/discovery-engine/service-store)', () => {
    it('groups real rows by (source, metric) into distinct series', async () => {
      order.mockResolvedValue({
        data: [
          { source: 'science', metric: 'publication_velocity_pct', value: 10, observed_at: '2026-07-01T00:00:00Z' },
          { source: 'science', metric: 'publication_velocity_pct', value: 40, observed_at: '2026-07-08T00:00:00Z' },
          { source: 'search_intent', metric: 'search_volume', value: 1000, observed_at: '2026-07-08T00:00:00Z' },
        ],
        error: null,
      })
      const { getRecentObservations } = await import('../service-store')
      const series = await getRecentObservations('berberine')

      expect(series).toHaveLength(2)
      expect(eqSelect).toHaveBeenCalledWith('niche_key', 'berberine')
    })
  })

  describe('writeDivergenceAlert', () => {
    it('upserts with the exact real column names and conflict target from migration 027', async () => {
      upsert.mockResolvedValue({ error: null })
      const { writeDivergenceAlert } = await import('../service-store')
      const detectedAt = new Date('2026-07-14T08:00:00Z')
      await writeDivergenceAlert({
        nicheKey: 'berberine',
        sourceA: 'science', metricA: 'publication_velocity_pct', priorValueA: 10, latestValueA: 40, changePctA: 200,
        sourceB: 'search_intent', metricB: 'search_volume', priorValueB: 1000, latestValueB: 600, changePctB: -40,
        divergencePct: 240,
        detectedAt,
      })

      expect(upsert).toHaveBeenCalledWith(
        {
          niche_key: 'berberine',
          source_a: 'science', metric_a: 'publication_velocity_pct',
          prior_value_a: 10, latest_value_a: 40, change_pct_a: 200,
          source_b: 'search_intent', metric_b: 'search_volume',
          prior_value_b: 1000, latest_value_b: 600, change_pct_b: -40,
          divergence_pct: 240,
          detected_at: detectedAt.toISOString(),
        },
        { onConflict: 'niche_key,source_a,metric_a,source_b,metric_b,detected_at' },
      )
    })

    it('never throws when the write fails', async () => {
      upsert.mockRejectedValue(new Error('network down'))
      const { writeDivergenceAlert } = await import('../service-store')
      await expect(writeDivergenceAlert({
        nicheKey: 'creatine',
        sourceA: 'science', metricA: 'publication_velocity_pct', priorValueA: 1, latestValueA: 2, changePctA: 100,
        sourceB: 'search_intent', metricB: 'search_volume', priorValueB: 100, latestValueB: 50, changePctB: -50,
        divergencePct: 150,
        detectedAt: new Date(),
      })).resolves.toBeUndefined()
    })

    it('is a no-op when service-role env vars are absent (fails closed, never throws)', async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const { writeDivergenceAlert } = await import('../service-store')
      await expect(writeDivergenceAlert({
        nicheKey: 'magnesium',
        sourceA: 'science', metricA: 'publication_velocity_pct', priorValueA: 1, latestValueA: 2, changePctA: 100,
        sourceB: 'search_intent', metricB: 'search_volume', priorValueB: 100, latestValueB: 50, changePctB: -50,
        divergencePct: 150,
        detectedAt: new Date(),
      })).resolves.toBeUndefined()
      expect(upsert).not.toHaveBeenCalled()
    })
  })
})
