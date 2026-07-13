// ── Allowed price IDs — read-only helper for plan display ───────────────────
//
// Mirrors the exact parsing app/api/billing/checkout/route.ts already does
// inline (comma-separated STRIPE_ALLOWED_PRICE_IDS). Deliberately a
// separate copy rather than an import from checkout/route.ts: this Beta
// Readiness fix must not modify payment logic, and checkout/route.ts is
// exactly that. Both read the same env var with the same semantics, so
// there is no real risk of the two drifting apart in practice.

export function getAllowedPriceIds(): string[] {
  return (process.env.STRIPE_ALLOWED_PRICE_IDS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
}
