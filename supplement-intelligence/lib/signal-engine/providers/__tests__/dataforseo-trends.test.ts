import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DataForSeoTrendsProvider } from '../dataforseo-trends'

const ORIGINAL_ENV = { ...process.env }

function graphPoint(timestamp: number, value: number, missing = false) {
  return { timestamp, missing_data: missing, values: [value] }
}

function mockTrendsResponse(graphData: unknown[], mapData: unknown[] = [], cost = 0.005) {
  return {
    ok: true,
    json: async () => ({
      tasks: [{
        status_code: 20000,
        cost,
        result: [{
          items: [
            { type: 'google_trends_graph', data: graphData },
            { type: 'google_trends_map', data: mapData },
          ],
        }],
      }],
    }),
  } as Response
}

describe('DataForSeoTrendsProvider (Roadmap M2.14)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATAFORSEO_TRENDS_ENABLED = 'true'
    process.env.DATAFORSEO_LOGIN = 'test-login'
    process.env.DATAFORSEO_PASSWORD = 'test-password'
  })
  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...ORIGINAL_ENV }
  })

  describe('enabled — deliberately opt-in, not opt-out', () => {
    it('is disabled by default when DATAFORSEO_TRENDS_ENABLED is unset, even with real credentials present', () => {
      delete process.env.DATAFORSEO_TRENDS_ENABLED
      expect(new DataForSeoTrendsProvider().enabled).toBe(false)
    })

    it('is disabled when explicitly enabled but credentials are missing', () => {
      delete process.env.DATAFORSEO_LOGIN
      expect(new DataForSeoTrendsProvider().enabled).toBe(false)
    })

    it('is enabled only when explicitly opted in AND credentials are present', () => {
      expect(new DataForSeoTrendsProvider().enabled).toBe(true)
    })
  })

  describe('fetch', () => {
    it('parses a real graph+map response into ProviderSignals with the real logged cost', async () => {
      const points = Array.from({ length: 20 }, (_, i) => graphPoint(1700000000 + i * 604800, 30 + i))
      vi.spyOn(global, 'fetch').mockResolvedValue(
        mockTrendsResponse(points, [{ geo_id: 'US-CA', geo_name: 'California', values: [80] }], 0.0075),
      )
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await new DataForSeoTrendsProvider().fetch({ query: 'berberine' })
      expect(result).not.toBeNull()
      expect(result?.provider).toBe('dataforseo-trends')
      expect(result?.demand?.top_regions).toEqual(['California'])
      expect(consoleSpy).toHaveBeenCalledWith('DataForSEO Trends: real call cost', expect.objectContaining({ cost: 0.0075 }))
    })

    it('returns null (never fabricated) with fewer than 8 real usable points', async () => {
      const points = Array.from({ length: 5 }, (_, i) => graphPoint(1700000000 + i * 604800, 30))
      vi.spyOn(global, 'fetch').mockResolvedValue(mockTrendsResponse(points))
      const result = await new DataForSeoTrendsProvider().fetch({ query: 'berberine' })
      expect(result).toBeNull()
    })

    it('excludes missing_data points from the real usable count', async () => {
      const points = [
        ...Array.from({ length: 5 }, (_, i) => graphPoint(1700000000 + i * 604800, 30)),
        ...Array.from({ length: 5 }, (_, i) => graphPoint(1700003000000 + i * 604800, 30, true)), // missing_data: true
      ]
      vi.spyOn(global, 'fetch').mockResolvedValue(mockTrendsResponse(points))
      const result = await new DataForSeoTrendsProvider().fetch({ query: 'berberine' })
      expect(result).toBeNull() // only 5 real usable points, missing ones correctly excluded
    })

    it('returns null on an unexpected/malformed real response shape, never a fabricated signal', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ tasks: [{ status_code: 20000, result: [{ items: [{ type: 'google_trends_graph', data: 'not-an-array' }] }] }] }),
      } as Response)
      const result = await new DataForSeoTrendsProvider().fetch({ query: 'berberine' })
      expect(result).toBeNull()
    })

    it('returns null on a real HTTP error', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401 } as Response)
      const result = await new DataForSeoTrendsProvider().fetch({ query: 'berberine' })
      expect(result).toBeNull()
    })

    it('returns null on a real task-level error (non-20000 status_code)', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ tasks: [{ status_code: 40000, status_message: 'bad request' }] }),
      } as Response)
      const result = await new DataForSeoTrendsProvider().fetch({ query: 'berberine' })
      expect(result).toBeNull()
    })

    it('returns null on a network failure', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
      const result = await new DataForSeoTrendsProvider().fetch({ query: 'berberine' })
      expect(result).toBeNull()
    })

    it('broadens a SKU-level query via the shared trends-query-broadening module until real data is found', async () => {
      const insufficientPoints = Array.from({ length: 2 }, (_, i) => graphPoint(1700000000 + i * 604800, 10))
      const sufficientPoints   = Array.from({ length: 15 }, (_, i) => graphPoint(1700000000 + i * 604800, 40))
      const fetchSpy = vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(mockTrendsResponse(insufficientPoints))
        .mockResolvedValueOnce(mockTrendsResponse(sufficientPoints))

      const result = await new DataForSeoTrendsProvider().fetch({ query: 'Collagen Peptide Gummies for Skin Support' })
      expect(result).not.toBeNull()
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('sends the exact documented request shape (endpoint, item_types, location_code)', async () => {
      const points = Array.from({ length: 10 }, (_, i) => graphPoint(1700000000 + i * 604800, 30))
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockTrendsResponse(points))
      await new DataForSeoTrendsProvider().fetch({ query: 'berberine' })

      const [url, init] = fetchSpy.mock.calls[0]
      expect(url).toBe('https://api.dataforseo.com/v3/keywords_data/google_trends/explore/live')
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body[0]).toMatchObject({ location_code: 2840, item_types: ['google_trends_graph', 'google_trends_map'] })
    })
  })
})
