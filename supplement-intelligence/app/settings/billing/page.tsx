'use client'

// ═══════════════════════════════════════════════════════════════════════
// Billing & Plans — Beta Readiness Audit (Critical, final blocker).
//
// Real Stitch reference: stitch-import/product-intelligence-design-
// foundation/screens/37c6347ebd62422499dd606a516a896b.html ("Billing &
// Plans"). Structure reused (current-plan card with a usage meter, a plan
// grid below it), but its specific numbers (Operator/$79, "10 Watch
// Slots", "PDF Exports", invoice rows with fabricated $ amounts) are
// decorative mockup content — this app has no watch-slot limit, no export
// feature, and no invoice-history read path, so none of that is
// reproduced. Every number on this real page comes from GET
// /api/billing/status, which itself only ever reflects real Stripe data
// and real profiles columns.
//
// checkout/portal/webhook (app/api/billing/*) are used exactly as they
// already exist — this page only calls them and renders their results,
// per "do not change payment logic."
//
// A user with an existing real subscription is deliberately NOT offered
// a second "Subscribe" button per plan — creating a second Stripe
// Checkout Session for a customer who already has an active subscription
// would start a SECOND, independent subscription rather than switching
// the existing one (checkout/route.ts always creates a new subscription;
// it has no "replace my current plan" logic, and this fix must not add
// any). Stripe's own Customer Portal (already wired via
// /api/billing/portal) is the real, safe path for changing or canceling
// an existing subscription — so existing subscribers are pointed there
// instead.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppShell } from '@/components/shell/AppShell'
import { HardCard, PrimaryButton, SecondaryButton, GhostLinkButton } from '@/components/ui'
import { formatPlanPrice, type PlanInfo } from '@/lib/billing/plan-display'

interface BillingProfile {
  analysesUsed:        number
  analysesLimit:       number
  hasStripeCustomer:   boolean
  subscriptionStatus:  string
  subscriptionPriceId: string | null
  currentPeriodEnd:    string | null
}

interface BillingStatus {
  billingEnabled: boolean
  profile:        BillingProfile
  plans:          PlanInfo[]
}

const HAS_REAL_SUBSCRIPTION = new Set(['trialing', 'active', 'past_due', 'unpaid'])

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function BillingContent() {
  const params = useSearchParams()
  const checkoutResult = params.get('checkout') // 'success' | 'canceled' | null

  const [status, setStatus]   = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [actioning, setActioning] = useState<string | null>(null) // priceId, or 'portal'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/status')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load billing status'); return }
      setStatus(data)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function goToCheckout(priceId: string) {
    setActioning(priceId)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      })
      const data = await res.json()
      if (res.ok && data.url) { window.location.href = data.url; return }
      setError(data.error ?? 'Failed to start checkout')
    } catch {
      setError('Network error — please try again')
    } finally {
      setActioning(null)
    }
  }

  async function goToPortal() {
    setActioning('portal')
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.url) { window.location.href = data.url; return }
      setError(data.error ?? 'Failed to open billing portal')
    } catch {
      setError('Network error — please try again')
    } finally {
      setActioning(null)
    }
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div className="space-y-2 border-b-2 border-black pb-4">
        <h1 className="text-headline-md text-black">Billing &amp; Plans</h1>
        <p className="text-sm text-ink-variant">Manage your subscription and analysis usage.</p>
      </div>

      {checkoutResult === 'success' && (
        <p className="text-sm text-verdict-positive bg-white border border-verdict-positive px-3 py-2">
          Subscription updated — it may take a few seconds to reflect below.
        </p>
      )}
      {checkoutResult === 'canceled' && (
        <p className="text-sm text-ink-variant bg-white border border-black px-3 py-2">
          Checkout was canceled — no changes were made.
        </p>
      )}
      {error && (
        <p className="text-sm text-verdict-negative bg-white border border-verdict-negative px-3 py-2">{error}</p>
      )}

      {loading && (
        <div className="border border-black bg-white p-8 animate-pulse">
          <div className="h-4 bg-surface-container w-48 mb-3" />
          <div className="h-3 bg-surface-container w-32" />
        </div>
      )}

      {!loading && status && !status.billingEnabled && (
        <div className="border border-black bg-white p-8 text-center space-y-2">
          <p className="text-[10px] font-mono text-outline uppercase tracking-[0.2em]">Status: Not Configured</p>
          <p className="text-sm text-ink-variant max-w-sm mx-auto">
            Billing is not yet configured for this deployment — your free-tier usage below is unaffected.
          </p>
        </div>
      )}

      {!loading && status && (
        <>
          {/* Current plan / usage */}
          <HardCard>
            <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
              <div>
                <p className="text-[10px] font-mono text-outline uppercase tracking-widest mb-1">Current Plan</p>
                <h2 className="text-lg font-black text-black uppercase">
                  {HAS_REAL_SUBSCRIPTION.has(status.profile.subscriptionStatus)
                    ? (status.plans.find(p => p.id === status.profile.subscriptionPriceId)?.productName ?? 'Active Subscription')
                    : 'Free Tier'}
                </h2>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wide border border-black px-2 py-1 text-ink-variant">
                {status.profile.subscriptionStatus}
              </span>
            </div>

            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-xs font-mono uppercase text-ink-variant">
                <span>Analyses Usage</span>
                <span>{status.profile.analysesUsed} / {status.profile.analysesLimit}</span>
              </div>
              <div className="w-full h-4 bg-surface-container border border-black overflow-hidden">
                <div
                  className="bg-black h-full"
                  style={{ width: `${status.profile.analysesLimit > 0 ? Math.min(100, (status.profile.analysesUsed / status.profile.analysesLimit) * 100) : 0}%` }}
                />
              </div>
            </div>

            {formatDate(status.profile.currentPeriodEnd) && (
              <p className="text-xs font-mono text-ink-variant mb-4">
                Current period ends {formatDate(status.profile.currentPeriodEnd)}
              </p>
            )}

            {status.billingEnabled && status.profile.hasStripeCustomer && (
              <SecondaryButton onClick={goToPortal} disabled={actioning === 'portal'}>
                {actioning === 'portal' ? 'Opening…' : 'Manage Billing →'}
              </SecondaryButton>
            )}
          </HardCard>

          {/* Plans grid — only for users without an existing real subscription;
              see file header for why an active subscriber isn't offered a
              second Checkout Session here. */}
          {status.billingEnabled && !HAS_REAL_SUBSCRIPTION.has(status.profile.subscriptionStatus) && (
            <section className="space-y-4">
              <div className="border-b-2 border-black pb-3">
                <h2 className="text-headline-md text-black">Available Plans</h2>
              </div>

              {status.plans.length === 0 ? (
                <p className="text-sm text-ink-variant border border-black bg-white p-6 text-center">
                  No plans are configured yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-black divide-y md:divide-y-0 md:divide-x divide-black bg-white">
                  {status.plans.map((plan, i) => (
                    <div key={plan.id} className="p-6 flex flex-col">
                      <p className="text-[10px] font-mono text-outline uppercase tracking-widest">Tier {String(i + 1).padStart(2, '0')}</p>
                      <h3 className="text-lg font-black text-black uppercase mt-1">{plan.productName}</h3>
                      <p className="text-2xl font-black text-black mt-3">{formatPlanPrice(plan)}</p>
                      {plan.analysesLimit !== null && (
                        <p className="text-xs font-mono text-ink-variant uppercase mt-3">
                          {plan.analysesLimit} analyses / month
                        </p>
                      )}
                      <PrimaryButton
                        className="mt-6"
                        onClick={() => goToCheckout(plan.id)}
                        disabled={actioning === plan.id}
                      >
                        {actioning === plan.id ? 'Redirecting…' : 'Subscribe'}
                      </PrimaryButton>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      <GhostLinkButton href="/research/profile">← Back to Settings</GhostLinkButton>
    </div>
  )
}

export default function BillingPage() {
  return (
    <AppShell active="settings">
      <Suspense fallback={
        <div className="flex items-center justify-center py-24">
          <p className="text-outline text-sm font-mono animate-pulse">Loading…</p>
        </div>
      }>
        <BillingContent />
      </Suspense>
    </AppShell>
  )
}
