// Regression test for Finding 5 (audit-confirmed correctness bug) in
// lib/manufacturing-engine/engine.ts's cacheKey() — complexity was omitted
// from the cache key, so a re-analysis of the same product/category with a
// different complexity hint would silently serve a stale result computed
// under the first complexity value for up to the 7-day cache TTL.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ManufacturingEstimate } from '../types'

const fetchMock = vi.fn()
vi.mock('../providers/registry', () => ({
  manufacturingProviders: [
    {
      id:      'apify',
      enabled: true,
      fetch:   (...args: unknown[]) => fetchMock(...args),
    },
  ],
}))

const cacheGet = vi.fn()
const cacheSet = vi.fn().mockResolvedValue(undefined)
vi.mock('../../provider-cache', () => ({
  cacheGet: (...args: unknown[]) => cacheGet(...args),
  cacheSet: (...args: unknown[]) => cacheSet(...args),
}))

import { fetchManufacturingEstimate } from '../engine'

function fakeEstimate(complexity: ManufacturingEstimate['complexity']): ManufacturingEstimate {
  return {
    product:             'Magnesium Glycinate',
    category:            'supplements',
    top_supplier_rating: null,
    complexity,
    confidence:          0.5,
    confidence_label:    'Medium',
    data_source:         'apify',
    notes:               'test',
    fetched_at:          new Date().toISOString(),
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  cacheGet.mockReset()
  cacheGet.mockResolvedValue(null)
  cacheSet.mockClear()
})

describe('Finding 5 — cache key includes complexity', () => {
  it('uses a different cache key for the same product/category with a different complexity hint', async () => {
    fetchMock.mockResolvedValueOnce(fakeEstimate('Low'))
    fetchMock.mockResolvedValueOnce(fakeEstimate('High'))

    await fetchManufacturingEstimate({ product: 'Magnesium Glycinate', category: 'supplements', complexity: 'Low' })
    await fetchManufacturingEstimate({ product: 'Magnesium Glycinate', category: 'supplements', complexity: 'High' })

    expect(cacheGet).toHaveBeenCalledTimes(2)
    const [keyLow]  = cacheGet.mock.calls[0]
    const [keyHigh] = cacheGet.mock.calls[1]
    expect(keyLow).not.toBe(keyHigh)

    // The cache writes must use the same distinguishing keys as the reads,
    // or a write under one complexity could still satisfy a read under another.
    expect(cacheSet).toHaveBeenCalledTimes(2)
    const [keySetLow]  = cacheSet.mock.calls[0]
    const [keySetHigh] = cacheSet.mock.calls[1]
    expect(keySetLow).toBe(keyLow)
    expect(keySetHigh).toBe(keyHigh)
  })

  it('reuses the same cache key for repeated calls with the same complexity (so caching still hits)', async () => {
    fetchMock.mockResolvedValue(fakeEstimate('Medium'))

    await fetchManufacturingEstimate({ product: 'Ashwagandha', category: 'supplements', complexity: 'Medium' })
    await fetchManufacturingEstimate({ product: 'Ashwagandha', category: 'supplements', complexity: 'Medium' })

    const [key1] = cacheGet.mock.calls[0]
    const [key2] = cacheGet.mock.calls[1]
    expect(key1).toBe(key2)
  })

  it('omitting complexity entirely still produces a stable, distinct key from an explicit hint', async () => {
    fetchMock.mockResolvedValueOnce(fakeEstimate('Medium'))
    fetchMock.mockResolvedValueOnce(fakeEstimate('Medium'))

    await fetchManufacturingEstimate({ product: 'Ashwagandha', category: 'supplements' })
    await fetchManufacturingEstimate({ product: 'Ashwagandha', category: 'supplements', complexity: 'Medium' })

    const [keyNoHint] = cacheGet.mock.calls[0]
    const [keyMedium]  = cacheGet.mock.calls[1]
    expect(keyNoHint).not.toBe(keyMedium)
  })
})
