import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { isBillingEnabled } from '@/lib/billing/stripe-client'
import { fetchPriceAndProduct } from '@/lib/billing/webhook-handler'
import { getAllowedPriceIds } from '@/lib/billing/allowed-plans'
import { toPlanInfo } from '@/lib/billing/plan-server'
import type { PlanInfo } from '@/lib/billing/plan-display'

// ── GET /api/billing/status ──────────────────────────────────────────────────
// Read-only. Powers /settings/billing — the missing page named in the Beta
// Readiness Audit (Critical): checkout/portal/webhook were all real and
// working, but nothing rendered a page for a user to actually subscribe.
//
// Returns the caller's own real profile billing state (never another
// user's — id = user.id, explicit filter) plus the real, Stripe-sourced
// display info for every price in STRIPE_ALLOWED_PRICE_IDS (the same
// allowlist app/api/billing/checkout/route.ts already enforces server-side
// — this route only ever displays what checkout would already accept).
// Invents no pricing, no plan names, no feature lists — every field here
// traces to a real Stripe object or a real profiles column.

function supabaseFromCookies() {
  const jar = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => jar.getAll(),
        setAll: (items: { name: string; value: string; options: Record<string, unknown> }[]) =>
          items.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    },
  )
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET() {
  const sb = supabaseFromCookies()
  const { data: { user }, error: authErr } = await sb.auth.getUser()
  if (authErr || !user) return err('Not authenticated.', 401)

  const billingEnabled = isBillingEnabled()

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: profile } = await admin
    .from('profiles')
    .select('analyses_used, analyses_limit, stripe_customer_id, subscription_status, subscription_price_id, current_period_end')
    .eq('id', user.id)
    .single()

  let plans: PlanInfo[] = []
  if (billingEnabled) {
    const allowedIds = getAllowedPriceIds()
    const resolved = await Promise.all(allowedIds.map(async id => {
      const fetched = await fetchPriceAndProduct(id)
      if (!fetched) return null
      return toPlanInfo(id, fetched.price, fetched.product)
    }))
    plans = resolved.filter((p): p is PlanInfo => p !== null)
  }

  return NextResponse.json({
    billingEnabled,
    profile: {
      analysesUsed:        profile?.analyses_used ?? 0,
      analysesLimit:       profile?.analyses_limit ?? 0,
      hasStripeCustomer:   !!profile?.stripe_customer_id,
      subscriptionStatus:  profile?.subscription_status ?? 'none',
      subscriptionPriceId: profile?.subscription_price_id ?? null,
      currentPeriodEnd:    profile?.current_period_end ?? null,
    },
    plans,
  })
}
