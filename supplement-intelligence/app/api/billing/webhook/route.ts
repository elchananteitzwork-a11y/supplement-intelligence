import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getStripeClient, isBillingEnabled } from '@/lib/billing/stripe-client'
import { applyStripeEvent } from '@/lib/billing/webhook-handler'

// ── POST /api/billing/webhook ───────────────────────────────────────────────
// Stripe calls this directly — not authenticated via cookies. Security
// rests entirely on signature verification (stripe.webhooks.constructEvent)
// against STRIPE_WEBHOOK_SECRET; a request with a missing or invalid
// `stripe-signature` header is rejected before any business logic runs.
//
// Idempotency: Stripe explicitly documents that the same event may be
// delivered more than once. billing_events.stripe_event_id has a unique
// constraint (migration 019) — this route inserts the event ID FIRST and
// treats a unique-violation as "already processed, no-op, return 200"
// rather than re-applying the event's effects.

function supabaseServiceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: Request) {
  if (!isBillingEnabled()) return NextResponse.json({ error: 'Billing not configured' }, { status: 501 })

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[Billing] STRIPE_WEBHOOK_SECRET is unset — refusing to process webhook.')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 501 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })

  const rawBody = await req.text()
  const stripe = getStripeClient()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (e: unknown) {
    console.error('[Billing] Webhook signature verification failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const sb = supabaseServiceRole()

  // Idempotency gate: insert the event ID before doing anything else. A
  // unique-constraint violation means this exact event was already
  // processed — acknowledge with 200 (Stripe should not retry) without
  // re-applying effects.
  const { error: insertErr } = await sb.from('billing_events').insert({
    stripe_event_id: event.id,
    event_type:       event.type,
    payload:           event as unknown as Record<string, unknown>,
  })
  if (insertErr) {
    if (insertErr.code === '23505') { // unique_violation
      console.log('[Billing] Duplicate webhook delivery, skipping', { eventId: event.id, type: event.type })
      return NextResponse.json({ received: true, duplicate: true })
    }
    console.error('[Billing] Failed to record billing event', insertErr.message)
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 })
  }

  const outcome = await applyStripeEvent(sb, event)
  console.log('[Billing] Webhook processed', { eventId: event.id, type: event.type, outcome })

  return NextResponse.json({ received: true })
}
