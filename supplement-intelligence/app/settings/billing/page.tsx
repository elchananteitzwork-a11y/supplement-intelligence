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
import Link from 'next/link'
import { AppShell } from '@/components/shell/AppShell'
import { PiCard } from '@/components/memo/shared'
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
      <div className="space-y-2 border-b border-pi-hairline pb-4">
        <h1 className="font-serif text-[28px] font-semibold leading-snug tracking-tight text-pi-ink sm:text-[32px]">Billing &amp; Plans</h1>
        <p className="text-sm text-pi-sub">Manage your subscription and analysis usage.</p>
      </div>

      {checkoutResult === 'success' && (
        <p className="text-sm text-pi-build rounded-lg border border-pi-build/30 bg-pi-build/10 px-3 py-2">
          Subscription updated — it may take a few seconds to reflect below.
        </p>
      )}
      {checkoutResult === 'canceled' && (
        <p className="text-sm text-pi-sub rounded-lg border border-pi-hairline bg-pi-card px-3 py-2">
          Checkout was canceled — no changes were made.
        </p>
      )}
      {error && (
        <p className="text-sm text-pi-risk rounded-lg border border-pi-risk/30 bg-pi-risk/10 px-3 py-2">{error}</p>
      )}

      {loading && (
        <div className="rounded-xl border border-pi-hairline bg-pi-card p-8 animate-pulse">
          <div className="h-4 bg-pi-sand w-48 mb-3" />
          <div className="h-3 bg-pi-sand w-32" />
        </div>
      )}

      {!loading && status && !status.billingEnabled && (
        <div className="rounded-xl border border-pi-hairline bg-pi-card p-8 text-center space-y-2">
          <p className="text-[10px] font-mono text-pi-faint uppercase tracking-[0.2em]">Status: Not Configured</p>
          <p className="text-sm text-pi-sub max-w-sm mx-auto">
            Billing is not yet configured for this deployment — your free-tier usage below is unaffected.
          </p>
        </div>
      )}

      {!loading && status && (
        <>
          {/* Current plan / usage */}
          <PiCard>
            <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
              <div>
                <p className="text-[10px] font-mono text-pi-faint uppercase tracking-widest mb-1">Current Plan</p>
                <h2 className="text-lg font-semibold text-pi-ink uppercase">
                  {HAS_REAL_SUBSCRIPTION.has(status.profile.subscriptionStatus)
                    ? (status.plans.find(p => p.id === status.profile.subscriptionPriceId)?.productName ?? 'Active Subscription')
                    : 'Free Tier'}
                </h2>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wide rounded-full border border-pi-hairline px-2 py-1 text-pi-sub">
                {status.profile.subscriptionStatus}
              </span>
            </div>

            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-xs font-mono uppercase text-pi-sub">
                <span>Analyses Usage</span>
                <span>{status.profile.analysesUsed} / {status.profile.analysesLimit}</span>
              </div>
              <div className="w-full h-4 rounded-full bg-pi-sand border border-pi-hairline overflow-hidden">
                <div
                  className="bg-pi-ink h-full"
                  style={{ width: `${status.profile.analysesLimit > 0 ? Math.min(100, (status.profile.analysesUsed / status.profile.analysesLimit) * 100) : 0}%` }}
                />
              </div>
            </div>

            {formatDate(status.profile.currentPeriodEnd) && (
              <p className="text-xs font-mono text-pi-sub mb-4">
                Current period ends {formatDate(status.profile.currentPeriodEnd)}
              </p>
            )}

            {status.billingEnabled && status.profile.hasStripeCustomer && (
              <button
                onClick={goToPortal}
                disabled={actioning === 'portal'}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-pi-hairline bg-pi-card px-5 py-2.5 text-sm font-semibold text-pi-ink hover:bg-pi-sand transition-colors duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {actioning === 'portal' ? 'Opening…' : 'Manage Billing →'}
              </button>
            )}
          </PiCard>

          {/* Plans grid — only for users without an existing real subscription;
              see file header for why an active subscriber isn't offered a
              second Checkout Session here. */}
          {status.billingEnabled && !HAS_REAL_SUBSCRIPTION.has(status.profile.subscriptionStatus) && (
            <section className="space-y-4">
              <div className="border-b border-pi-hairline pb-3">
                <h2 className="font-serif text-[22px] font-semibold leading-snug tracking-tight text-pi-ink">Available Plans</h2>
              </div>

              {status.plans.length === 0 ? (
                <p className="text-sm text-pi-sub rounded-xl border border-pi-hairline bg-pi-card p-6 text-center">
                  No plans are configured yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 rounded-xl border border-pi-hairline divide-y md:divide-y-0 md:divide-x divide-pi-hairline bg-pi-card overflow-hidden">
                  {status.plans.map((plan, i) => (
                    <div key={plan.id} className="p-6 flex flex-col">
                      <p className="text-[10px] font-mono text-pi-faint uppercase tracking-widest">Tier {String(i + 1).padStart(2, '0')}</p>
                      <h3 className="text-lg font-semibold text-pi-ink uppercase mt-1">{plan.productName}</h3>
                      <p className="text-2xl font-semibold text-pi-ink mt-3">{formatPlanPrice(plan)}</p>
                      {plan.analysesLimit !== null && (
                        <p className="text-xs font-mono text-pi-sub uppercase mt-3">
                          {plan.analysesLimit} analyses / month
                        </p>
                      )}
                      <button
                        onClick={() => goToCheckout(plan.id)}
                        disabled={actioning === plan.id}
                        className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-pi-ink px-6 py-3 text-sm font-semibold text-pi-cream shadow-[0_1px_3px_rgba(22,23,26,0.15)] transition-all duration-200 hover:-translate-y-px hover:bg-[#24262B] hover:shadow-[0_4px_10px_rgba(22,23,26,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright active:scale-[0.985] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                      >
                        {actioning === plan.id ? 'Redirecting…' : 'Subscribe'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      <Link href="/research/profile" className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wide text-pi-sub hover:text-pi-ink transition-colors">
        ← Back to Settings
      </Link>
    </div>
  )
}

export default function BillingPage() {
  return (
    <AppShell active="settings" variant="pi">
      <Suspense fallback={
        <div className="flex items-center justify-center py-24">
          <p className="text-pi-faint text-sm font-mono animate-pulse">Loading…</p>
        </div>
      }>
        <BillingContent />
      </Suspense>
    </AppShell>
  )
}
