import { describe, it, expect } from 'vitest'
import { toPlanInfo } from '../plan-server'
import type Stripe from 'stripe'

function makePrice(overrides: Partial<Stripe.Price> = {}): Stripe.Price {
  return {
    id: 'price_123',
    unit_amount: 2900,
    currency: 'usd',
    nickname: null,
    recurring: { interval: 'month' } as Stripe.Price.Recurring,
    metadata: {},
    ...overrides,
  } as Stripe.Price
}

function makeProduct(overrides: Partial<Stripe.Product> = {}): Stripe.Product {
  return {
    id: 'prod_123',
    name: 'Starter',
    metadata: {},
    ...overrides,
  } as Stripe.Product
}

describe('toPlanInfo', () => {
  it('reads the real product name when a product is expanded', () => {
    const info = toPlanInfo('price_123', makePrice(), makeProduct({ name: 'Operator' }))
    expect(info.productName).toBe('Operator')
  })

  it('falls back to the price nickname when there is no product', () => {
    const info = toPlanInfo('price_123', makePrice({ nickname: 'Solo Plan' }), null)
    expect(info.productName).toBe('Solo Plan')
  })

  it('falls back to the raw price id when neither a product name nor nickname exists — never a fabricated name', () => {
    const info = toPlanInfo('price_123', makePrice({ nickname: null }), null)
    expect(info.productName).toBe('price_123')
  })

  it('reads the real unit amount, currency, and interval', () => {
    const info = toPlanInfo('price_123', makePrice({ unit_amount: 7900, currency: 'usd', recurring: { interval: 'month' } as Stripe.Price.Recurring }), makeProduct())
    expect(info.unitAmount).toBe(7900)
    expect(info.currency).toBe('usd')
    expect(info.interval).toBe('month')
  })

  it('reports unitAmount/interval as null rather than guessing when Stripe has none set', () => {
    const info = toPlanInfo('price_123', makePrice({ unit_amount: null, recurring: null }), makeProduct())
    expect(info.unitAmount).toBeNull()
    expect(info.interval).toBeNull()
  })

  it('reuses the real parseAnalysesLimit metadata read — null when absent, never guessed', () => {
    const withLimit = toPlanInfo('price_123', makePrice({ metadata: { analyses_limit: '50' } }), makeProduct())
    expect(withLimit.analysesLimit).toBe(50)

    const withoutLimit = toPlanInfo('price_123', makePrice({ metadata: {} }), makeProduct({ metadata: {} }))
    expect(withoutLimit.analysesLimit).toBeNull()
  })
})
