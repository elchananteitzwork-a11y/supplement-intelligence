// Stripe webhook handler tests — Roadmap item 8, Milestone 8.
//
// Covers: event-type routing, "no invented pricing" (analyses_limit is
// read from Stripe metadata, never guessed or defaulted for a paid plan),
// and the free-tier revert on subscription deletion using the existing
// profiles.analyses_limit default (3), not a new number.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyStripeEvent } from '../webhook-handler'
import type Stripe from 'stripe'

const pricesRetrieve = vi.fn()

vi.mock('../stripe-client', () => ({
  getStripeClient: () => ({ prices: { retrieve: pricesRetrieve } }),
}))

function mockSupabase(updateResult: { error: { message: string; code?: string } | null } = { error: null }) {
  const eq = vi.fn().mockResolvedValue(updateResult)
  const update = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ update })
  return { from, update, eq }
}

function subscriptionEvent(overrides: Partial<Stripe.Subscription> = {}, type: Stripe.Event['type'] = 'customer.subscription.updated'): Stripe.Event {
  return {
    id: 'evt_1', type,
    data: {
      object: {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        items: { data: [{ price: 'price_1', current_period_end: 1_800_000_000 }] },
        ...overrides,
      } as unknown as Stripe.Subscription,
    },
  } as unknown as Stripe.Event
}

function checkoutEvent(overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: 'evt_2', type: 'checkout.session.completed',
    data: {
      object: {
        mode: 'subscription',
        client_reference_id: 'user_1',
        customer: 'cus_1',
        ...overrides,
      },
    },
  } as unknown as Stripe.Event
}

describe('applyStripeEvent — event-type routing', () => {
  beforeEach(() => { pricesRetrieve.mockReset() })

  it('returns handled:false for an unrecognized event type', async () => {
    const { from } = mockSupabase()
    const event = { id: 'evt_x', type: 'invoice.paid' } as unknown as Stripe.Event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await applyStripeEvent({ from } as any, event)
    expect(outcome.handled).toBe(false)
  })
})

describe('applyStripeEvent — checkout.session.completed', () => {
  it('links stripe_customer_id to the user for a subscription checkout', async () => {
    const { from, update, eq } = mockSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await applyStripeEvent({ from } as any, checkoutEvent())
    expect(outcome.handled).toBe(true)
    expect(from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ stripe_customer_id: 'cus_1' })
    expect(eq).toHaveBeenCalledWith('id', 'user_1')
  })

  it('does not handle a non-subscription checkout (e.g. one-time payment mode)', async () => {
    const { from } = mockSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await applyStripeEvent({ from } as any, checkoutEvent({ mode: 'payment' }))
    expect(outcome.handled).toBe(false)
  })

  it('does not handle a checkout missing client_reference_id', async () => {
    const { from } = mockSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await applyStripeEvent({ from } as any, checkoutEvent({ client_reference_id: null }))
    expect(outcome.handled).toBe(false)
  })
})

describe('applyStripeEvent — subscription created/updated: no invented pricing', () => {
  beforeEach(() => { pricesRetrieve.mockReset() })

  it('reads analyses_limit from the Price metadata and applies it verbatim', async () => {
    pricesRetrieve.mockResolvedValue({ metadata: { analyses_limit: '50' }, product: null })
    const { from, update } = mockSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await applyStripeEvent({ from } as any, subscriptionEvent())
    expect(outcome.handled).toBe(true)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ analyses_limit: 50 }))
  })

  it('falls back to Product-level metadata when Price metadata is absent', async () => {
    pricesRetrieve.mockResolvedValue({
      metadata: {},
      product: { metadata: { analyses_limit: '25' } },
    })
    const { from, update } = mockSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyStripeEvent({ from } as any, subscriptionEvent())
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ analyses_limit: 25 }))
  })

  it('NEVER sets analyses_limit when neither Price nor Product has valid metadata — status still updates', async () => {
    pricesRetrieve.mockResolvedValue({ metadata: {}, product: null })
    const { from, update } = mockSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await applyStripeEvent({ from } as any, subscriptionEvent())
    expect(outcome.handled).toBe(true)
    const [payload] = update.mock.calls[0]
    expect(payload).not.toHaveProperty('analyses_limit')
    expect(payload.subscription_status).toBe('active')
  })

  it('rejects a non-positive or non-numeric analyses_limit rather than applying garbage', async () => {
    for (const bad of ['0', '-5', 'unlimited', '']) {
      pricesRetrieve.mockResolvedValue({ metadata: { analyses_limit: bad }, product: null })
      const { from, update } = mockSupabase()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await applyStripeEvent({ from } as any, subscriptionEvent())
      const [payload] = update.mock.calls[0]
      expect(payload).not.toHaveProperty('analyses_limit')
    }
  })

  it('converts current_period_end from unix seconds to an ISO timestamp', async () => {
    pricesRetrieve.mockResolvedValue({ metadata: { analyses_limit: '50' }, product: null })
    const { from, update } = mockSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyStripeEvent({ from } as any, subscriptionEvent())
    const [payload] = update.mock.calls[0]
    expect(payload.current_period_end).toBe(new Date(1_800_000_000 * 1000).toISOString())
  })

  it('is a no-op reason when the subscription has zero line items', async () => {
    const { from } = mockSupabase()
    const event = subscriptionEvent({ items: { data: [] } as unknown as Stripe.Subscription['items'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await applyStripeEvent({ from } as any, event)
    expect(outcome.handled).toBe(false)
  })
})

describe('applyStripeEvent — subscription deleted: revert to existing free-tier default', () => {
  it('sets status canceled, clears current_period_end, and reverts to the SAME default already on profiles (3) — not a new invented number', async () => {
    const { from, update } = mockSupabase()
    const event = subscriptionEvent({}, 'customer.subscription.deleted')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await applyStripeEvent({ from } as any, event)
    expect(outcome.handled).toBe(true)
    expect(update).toHaveBeenCalledWith({
      subscription_status: 'canceled',
      current_period_end:  null,
      analyses_limit:      3, // matches migrations/001_schema.sql profiles.analyses_limit default
    })
  })
})
