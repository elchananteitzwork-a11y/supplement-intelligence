// ── Plan display shaping — Beta Readiness Audit (Critical, final) ──────────
//
// Pure, directly testable, and deliberately free of any import that pulls
// in the real Stripe SDK (see plan-server.ts for that half) — this file is
// imported by the client-side /settings/billing page, and the Stripe
// Node SDK has no reason to ship to the browser. formatPlanPrice() only
// ever formats real numbers that already arrived from
// GET /api/billing/status; it never fabricates a price.

export interface PlanInfo {
  id:            string
  productName:   string
  unitAmount:    number | null   // smallest currency unit (e.g. cents); null when Stripe has none set
  currency:      string
  interval:      string | null   // 'month' | 'year' | ... ; null for a one-time price
  analysesLimit: number | null
}

// $0 is displayed honestly as "$0.00", not hidden.
export function formatPlanPrice(plan: Pick<PlanInfo, 'unitAmount' | 'currency' | 'interval'>): string {
  if (plan.unitAmount === null) return 'Contact us'
  const amount = (plan.unitAmount / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: plan.currency.toUpperCase(),
  })
  return plan.interval ? `${amount}/${plan.interval}` : amount
}
