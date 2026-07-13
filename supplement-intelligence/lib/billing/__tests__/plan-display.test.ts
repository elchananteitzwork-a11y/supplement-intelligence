import { describe, it, expect } from 'vitest'
import { formatPlanPrice } from '../plan-display'

describe('formatPlanPrice', () => {
  it('formats a real recurring price with its real interval', () => {
    expect(formatPlanPrice({ unitAmount: 7900, currency: 'usd', interval: 'month' })).toBe('$79.00/month')
  })

  it('formats a one-time price (no interval) without a trailing slash', () => {
    expect(formatPlanPrice({ unitAmount: 5000, currency: 'usd', interval: null })).toBe('$50.00')
  })

  it('honestly shows $0.00 rather than hiding a real free price', () => {
    expect(formatPlanPrice({ unitAmount: 0, currency: 'usd', interval: 'month' })).toBe('$0.00/month')
  })

  it('never fabricates a price when Stripe has none set', () => {
    expect(formatPlanPrice({ unitAmount: null, currency: 'usd', interval: 'month' })).toBe('Contact us')
  })

  it('respects a non-USD currency', () => {
    expect(formatPlanPrice({ unitAmount: 2500, currency: 'eur', interval: 'month' })).toBe('€25.00/month')
  })
})
