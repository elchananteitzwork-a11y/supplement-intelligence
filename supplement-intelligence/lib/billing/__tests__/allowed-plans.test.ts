import { describe, it, expect, afterEach, vi } from 'vitest'
import { getAllowedPriceIds } from '../allowed-plans'

describe('getAllowedPriceIds', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('parses a comma-separated list, trimming whitespace', () => {
    vi.stubEnv('STRIPE_ALLOWED_PRICE_IDS', 'price_a, price_b ,price_c')
    expect(getAllowedPriceIds()).toEqual(['price_a', 'price_b', 'price_c'])
  })

  it('returns an empty array (never a guessed default) when unset', () => {
    vi.stubEnv('STRIPE_ALLOWED_PRICE_IDS', undefined)
    expect(getAllowedPriceIds()).toEqual([])
  })

  it('drops empty entries from stray commas', () => {
    vi.stubEnv('STRIPE_ALLOWED_PRICE_IDS', 'price_a,,price_b,')
    expect(getAllowedPriceIds()).toEqual(['price_a', 'price_b'])
  })
})
