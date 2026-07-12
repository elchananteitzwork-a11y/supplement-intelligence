import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { getStripeClient, isBillingEnabled } from '@/lib/billing/stripe-client'

// ── POST /api/billing/portal ────────────────────────────────────────────────
// Creates a Stripe Customer Portal session for the authenticated user
// (requires they've completed checkout at least once, so
// profiles.stripe_customer_id already exists) and returns its URL — where
// the user manages payment method, invoices, and cancellation entirely
// within Stripe's own hosted UI. No plan/cancellation logic is duplicated
// here.

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

export async function POST() {
  if (!isBillingEnabled()) return err('Billing is not configured on this deployment.', 501)

  const sb = supabaseFromCookies()
  const { data: { user }, error: authErr } = await sb.auth.getUser()
  if (authErr || !user) return err('Not authenticated.', 401)

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  const customerId = profile?.stripe_customer_id as string | null | undefined
  if (!customerId) return err('No billing account found for this user yet — subscribe first.', 404)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const stripe = getStripeClient()

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${appUrl}/settings/billing`,
    })
    return NextResponse.json({ url: session.url })
  } catch (e: unknown) {
    console.error('[Billing] Portal session creation failed', e instanceof Error ? e.message : e)
    return err('Failed to create billing portal session.', 502)
  }
}
