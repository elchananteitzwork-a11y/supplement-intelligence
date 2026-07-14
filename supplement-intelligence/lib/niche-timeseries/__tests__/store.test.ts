import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const upsert = vi.fn()
const from = vi.fn((table: string) => {
  if (table === 'niche_timeseries') return { upsert }
  throw new Error(`unexpected table ${table}`)
})

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from })) }))

const ORIGINAL_ENV = { ...process.env }

describe('lib/niche-timeseries/store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })
  afterEach(() => { process.env = { ...ORIGINAL_ENV } })

  it('appendObservation upserts a real row with the exact conflict target', async () => {
    upsert.mockResolvedValue({ error: null })
    const { appendObservation } = await import('../store')
    const observedAt = new Date('2026-07-14T08:00:00Z')
    await appendObservation({ nicheKey: 'berberine', source: 'science', metric: 'publication_velocity_pct', value: 12.3, observedAt })

    expect(upsert).toHaveBeenCalledWith(
      {
        niche_key: 'berberine',
        source: 'science',
        metric: 'publication_velocity_pct',
        value: 12.3,
        observed_at: observedAt.toISOString(),
      },
      { onConflict: 'niche_key,source,metric,observed_at' },
    )
  })

  it('appendObservation defaults observed_at to now when not provided', async () => {
    upsert.mockResolvedValue({ error: null })
    const { appendObservation } = await import('../store')
    const before = Date.now()
    await appendObservation({ nicheKey: 'creatine', source: 'keepa', metric: 'demand_acceleration_pct', value: 4 })
    const after = Date.now()

    const writtenAt = new Date(upsert.mock.calls[0][0].observed_at).getTime()
    expect(writtenAt).toBeGreaterThanOrEqual(before)
    expect(writtenAt).toBeLessThanOrEqual(after)
  })

  it('appendObservation never throws when the client write fails', async () => {
    upsert.mockResolvedValue({ error: { message: 'boom' } })
    const { appendObservation } = await import('../store')
    await expect(appendObservation({ nicheKey: 'magnesium', source: 'keepa', metric: 'young_listing_pct_24m', value: 10 })).resolves.toBeUndefined()
  })

  it('appendObservation never throws when the client throws', async () => {
    upsert.mockRejectedValue(new Error('network down'))
    const { appendObservation } = await import('../store')
    await expect(appendObservation({ nicheKey: 'magnesium', source: 'keepa', metric: 'young_listing_pct_24m', value: 10 })).resolves.toBeUndefined()
  })

  it('appendObservation is a silent no-op when Supabase env vars are absent', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const { appendObservation } = await import('../store')
    await appendObservation({ nicheKey: 'sea moss', source: 'keepa', metric: 'gap_velocity', value: 1 })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('appendObservations writes only the real, non-null, non-NaN observations', async () => {
    upsert.mockResolvedValue({ error: null })
    const { appendObservations } = await import('../store')
    await appendObservations([
      { nicheKey: 'nad+', source: 'science', metric: 'trial_registrations_count', value: 5 },
      null,
      { nicheKey: 'nad+', source: 'science', metric: 'publication_velocity_pct', value: NaN },
    ])
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0].metric).toBe('trial_registrations_count')
  })
})
