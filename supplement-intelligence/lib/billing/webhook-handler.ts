import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getStripeClient } from './stripe-client'

// ── Stripe webhook event handler ───────────────────────────────────────────
//
// Separated from the route handler (app/api/billing/webhook/route.ts) so
// the business logic — idempotency, which events to act on, how to derive
// analyses_limit — is unit-testable without live Stripe signature
// verification or network calls. The route handles only: read raw body,
// verify signature, hand the resulting Stripe.Event to applyStripeEvent().
//
// Design principle: this file invents no pricing, no tier names, no dollar
// amounts, no default analyses_limit for a paid plan. The account owner
// attaches an "analyses_limit" metadata key (a plain integer string) to
// their own Stripe Price or Product in the Stripe Dashboard — a real
// business decision that belongs to them. This handler only ever
// mechanically reads that value and applies it. If it's missing or not a
// valid positive integer, the handler logs a warning and leaves
// profiles.analyses_limit untouched rather than guessing or zeroing it —
// "no synthetic values."

export type StripeEventOutcome =
  | { handled: true;  action: string }
  | { handled: false; reason: string }

// Revert target when a subscription genuinely ends (not merely scheduled
// to cancel) — reuses the exact free-tier default already defined on
// profiles.analyses_limit (migration 001), not a new invented number.
const FREE_TIER_ANALYSES_LIMIT = 3

// Exported for reuse by app/api/billing/plans/route.ts (the plan-listing
// endpoint for the /settings/billing page) — same real metadata read, not
// a second, divergent parsing of "analyses_limit."
export function parseAnalysesLimit(price: Stripe.Price, product: Stripe.Product | null): number | null {
  const raw = price.metadata?.analyses_limit ?? product?.metadata?.analyses_limit
  if (!raw) return null
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function fetchPriceAndProduct(priceId: string): Promise<{ price: Stripe.Price; product: Stripe.Product | null } | null> {
  const stripe = getStripeClient()
  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
  const product = typeof price.product === 'object' && price.product && !('deleted' in price.product)
    ? price.product as Stripe.Product
    : null
  return { price, product }
}

async function upsertSubscriptionState(
  sb: SupabaseClient,
  customerId: string,
  fields: {
    stripe_subscription_id?: string | null
    subscription_status?:    string
    subscription_price_id?:  string | null
    current_period_end?:     string | null
    analyses_limit?:         number
  },
): Promise<void> {
  const { error } = await sb
    .from('profiles')
    .update(fields)
    .eq('stripe_customer_id', customerId)
  if (error) {
    console.error('[Billing] Failed to update profile from webhook', { customerId, error: error.message })
  }
}

async function handleSubscriptionEvent(sb: SupabaseClient, sub: Stripe.Subscription): Promise<StripeEventOutcome> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const item = sub.items.data[0]
  if (!item) return { handled: false, reason: 'subscription has no line items' }

  const priceId = typeof item.price === 'string' ? item.price : item.price.id
  const resolved = await fetchPriceAndProduct(priceId)
  if (!resolved) return { handled: false, reason: `could not resolve price ${priceId}` }

  const limit = parseAnalysesLimit(resolved.price, resolved.product)
  if (limit === null) {
    console.warn(
      '[Billing] Price/Product has no valid "analyses_limit" metadata — subscription status updated, ' +
      'but analyses_limit left UNCHANGED rather than guessed.',
      { priceId },
    )
  }

  const periodEndUnix = item.current_period_end
  await upsertSubscriptionState(sb, customerId, {
    stripe_subscription_id: sub.id,
    subscription_status:    sub.status,
    subscription_price_id:  priceId,
    current_period_end:     typeof periodEndUnix === 'number' ? new Date(periodEndUnix * 1000).toISOString() : null,
    ...(limit !== null ? { analyses_limit: limit } : {}),
  })

  return { handled: true, action: `subscription ${sub.status}${limit !== null ? `, analyses_limit=${limit}` : ''}` }
}

async function handleSubscriptionDeleted(sb: SupabaseClient, sub: Stripe.Subscription): Promise<StripeEventOutcome> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  await upsertSubscriptionState(sb, customerId, {
    subscription_status: 'canceled',
    current_period_end:  null,
    analyses_limit:      FREE_TIER_ANALYSES_LIMIT,
  })
  return { handled: true, action: `subscription canceled, reverted to free tier (${FREE_TIER_ANALYSES_LIMIT})` }
}

async function handleCheckoutCompleted(sb: SupabaseClient, session: Stripe.Checkout.Session): Promise<StripeEventOutcome> {
  if (session.mode !== 'subscription') return { handled: false, reason: 'not a subscription checkout' }
  const userId = session.client_reference_id
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  if (!userId || !customerId) return { handled: false, reason: 'missing client_reference_id or customer' }

  // Link the Stripe customer to the Supabase user now — subsequent
  // subscription.updated events key off stripe_customer_id, so this must
  // land before (or atomically with) them. checkout.session.completed and
  // the immediately-following customer.subscription.created typically
  // arrive close together but are not guaranteed ordered; this write is
  // idempotent (same customerId every time) so re-application is harmless.
  const { error } = await sb
    .from('profiles')
    .update({ stripe_customer_id: customerId })
    .eq('id', userId)
  if (error) {
    return { handled: false, reason: `failed to link customer: ${error.message}` }
  }
  return { handled: true, action: `linked stripe_customer_id ${customerId} to user ${userId}` }
}

// ── Public entry point ──────────────────────────────────────────────────────
//
// Idempotent: the caller (route handler) is responsible for the
// billing_events uniqueness insert BEFORE calling this — see route.ts.
// This function assumes it is being called at most once per real event.
export async function applyStripeEvent(sb: SupabaseClient, event: Stripe.Event): Promise<StripeEventOutcome> {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(sb, event.data.object as Stripe.Checkout.Session)
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return handleSubscriptionEvent(sb, event.data.object as Stripe.Subscription)
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(sb, event.data.object as Stripe.Subscription)
    default:
      return { handled: false, reason: `unhandled event type: ${event.type}` }
  }
}
