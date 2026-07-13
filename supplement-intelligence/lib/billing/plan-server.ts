// ── Plan shaping — server-only half ─────────────────────────────────────────
// Split from plan-display.ts specifically so the client-side
// /settings/billing page never transitively imports the real Stripe SDK
// (via webhook-handler.ts -> stripe-client.ts) just to format a price —
// this file is imported only by app/api/billing/status/route.ts.

import type Stripe from 'stripe'
import { parseAnalysesLimit } from './webhook-handler'
import type { PlanInfo } from './plan-display'

export function toPlanInfo(priceId: string, price: Stripe.Price, product: Stripe.Product | null): PlanInfo {
  return {
    id:            priceId,
    productName:   product?.name ?? price.nickname ?? priceId,
    unitAmount:    price.unit_amount ?? null,
    currency:      price.currency,
    interval:      price.recurring?.interval ?? null,
    analysesLimit: parseAnalysesLimit(price, product),
  }
}
