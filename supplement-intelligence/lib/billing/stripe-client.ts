import Stripe from 'stripe'

// ── Stripe client — lazy singleton, gated on STRIPE_SECRET_KEY ────────────
//
// Same "safely inert without credentials" pattern as every other optional
// provider in this codebase (see lib/signal-engine/providers/meta-ads.ts,
// tiktok.ts). No Stripe account, no test keys, no code path in this app
// can ever call Stripe — every billing route checks isBillingEnabled()
// first and returns a clear error rather than throwing.

let client: Stripe | null = null

export function isBillingEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

export function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured — STRIPE_SECRET_KEY is unset.')
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // Pinned to the version this SDK (stripe@22.3.1) ships as its
      // TypeScript-enforced ApiVersion literal — verified against
      // node_modules/stripe/cjs/apiVersion.d.ts at install time, not
      // guessed. Bump only alongside an intentional `npm install stripe`
      // upgrade, never independently.
      apiVersion: '2026-06-24.dahlia',
    })
  }
  return client
}

// Test-only: reset the singleton so tests can inject a fresh mock per case.
export function __resetStripeClientForTests(): void {
  client = null
}
