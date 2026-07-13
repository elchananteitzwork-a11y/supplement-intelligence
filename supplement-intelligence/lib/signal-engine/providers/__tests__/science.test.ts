// Science provider tests — Roadmap M2.5. This provider only ever reads the
// nightly batch's cache entry — it never makes a live PubMed/ClinicalTrials.gov
// call itself, so these tests mock lib/provider-cache, not fetch.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScienceProvider } from '../science'
import type { ScienceSignal } from '../../types'

const cacheGet = vi.fn()
vi.mock('@/lib/provider-cache', () => ({ cacheGet: (...args: unknown[]) => cacheGet(...args) }))

describe('ScienceProvider', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns null (honest) when the query does not match a tracked ingredient', async () => {
    const provider = new ScienceProvider()
    const result = await provider.fetch({ query: 'ashwagandha for stress' })
    expect(result).toBeNull()
    expect(cacheGet).not.toHaveBeenCalled()
  })

  it('returns null (honest) when the ingredient is tracked but the nightly batch has not populated it yet', async () => {
    cacheGet.mockResolvedValue(null)
    const provider = new ScienceProvider()
    const result = await provider.fetch({ query: 'berberine for blood sugar' })
    expect(result).toBeNull()
    expect(cacheGet).toHaveBeenCalledWith('science:v1:berberine')
  })

  it('returns the real cached ScienceSignal, wiring the matched ingredient into the cache key, for a tracked, populated ingredient', async () => {
    const signal: ScienceSignal = {
      score: 5, confidence: 0.6, ingredient: 'creatine',
      trial_registrations_count: 50, as_of: '2026-07-13T08:00:00.000Z',
    }
    cacheGet.mockResolvedValue(signal)
    const provider = new ScienceProvider()
    const result = await provider.fetch({ query: 'creatine gummies for muscle' })
    expect(cacheGet).toHaveBeenCalledWith('science:v1:creatine')
    expect(result).toMatchObject({ science: signal, provider: 'science', confidence: 0.6 })
    expect(result?.fetched_at).toBeDefined()
  })
})
