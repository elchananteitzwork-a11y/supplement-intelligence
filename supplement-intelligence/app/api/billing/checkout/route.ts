import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { getStripeClient, isBillingEnabled } from '@/lib/billing/stripe-client'

// ── POST /api/billing/checkout ─────────────────────────────────────────────
// Body: { priceId: string }
// Creates a Stripe Checkout Session for the authenticated user and returns
// its URL. priceId must be present in STRIPE_ALLOWED_PRICE_IDS (comma-
// separated) — fails closed (secure by default) rather than trusting any
// client-supplied price ID, since this account may have Stripe Products
// unrelated to this app. Never invents a price or plan itself.

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

export async function POST(req: Request) {
  if (!isBillingEnabled()) return err('Billing is not configured on this deployment.', 501)

  const sb = supabaseFromCookies()
  const { data: { user }, error: authErr } = await sb.auth.getUser()
  if (authErr || !user) return err('Not authenticated.', 401)

  let body: { priceId?: string }
  try { body = await req.json() } catch { return err('Invalid JSON body') }
  const { priceId } = body
  if (!priceId) return err('priceId is required')

  const allowed = (process.env.STRIPE_ALLOWED_PRICE_IDS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
  if (!allowed.length) return err('STRIPE_ALLOWED_PRICE_IDS is not configured — refusing to accept an unvalidated price ID.', 501)
  if (!allowed.includes(priceId)) return err('priceId is not an allowed plan.', 400)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const stripe = getStripeClient()

  // Service role: reading/writing profiles.stripe_customer_id for the
  // authenticated user's own row only (id = user.id, explicit filter below
  // — never a cross-user query), same pattern as other routes that need a
  // privileged read the anon-key RLS policy wouldn't otherwise allow in one
  // round trip.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .single()

  let customerId = profile?.stripe_customer_id as string | null | undefined
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/settings/billing?checkout=success`,
      cancel_url:  `${appUrl}/settings/billing?checkout=canceled`,
    })
    if (!session.url) return err('Stripe did not return a checkout URL.', 502)
    return NextResponse.json({ url: session.url })
  } catch (e: unknown) {
    console.error('[Billing] Checkout session creation failed', e instanceof Error ? e.message : e)
    return err('Failed to create checkout session.', 502)
  }
}
