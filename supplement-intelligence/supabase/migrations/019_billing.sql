-- ── Billing (Stripe) ─────────────────────────────────────────────────────
-- Roadmap item 8, Milestone 8 (second half — beta usage limits already
-- exist via profiles.analyses_used/analyses_limit + consume_analysis_slot,
-- migrations 001-004; this migration is purely additive on top of that).
--
-- Design principle: this migration invents no pricing, no tier names, no
-- dollar amounts. analyses_limit is set at webhook-processing time by
-- reading the "analyses_limit" metadata key the account owner attaches to
-- their own Stripe Price/Product in the Stripe Dashboard — a real business
-- decision that belongs to the user, not something this migration or the
-- webhook handler should hardcode. See lib/billing/webhook-handler.ts.

alter table public.profiles
  add column if not exists stripe_customer_id     text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists subscription_status    text
    check (subscription_status in ('none','trialing','active','past_due','canceled','unpaid') or subscription_status is null),
  add column if not exists subscription_price_id  text,
  add column if not exists current_period_end     timestamptz;

create index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

-- Append-only log of processed Stripe webhook event IDs — required for
-- idempotency. Stripe explicitly documents that webhook events may be
-- delivered more than once; without this, a retried delivery could
-- double-apply a subscription-limit change or double-refund a slot.
-- Mirrors the append-only, no-UPDATE/DELETE pattern already established
-- for verdict_ledger (migration 017) and build_now_patterns (016).
create table if not exists public.billing_events (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  stripe_event_id  text not null unique,
  event_type       text not null,
  user_id          uuid references auth.users(id) on delete set null,
  payload          jsonb not null
);

alter table public.billing_events enable row level security;
-- No policies for regular users — this table is written and read
-- exclusively by the webhook route using the service-role key (webhooks
-- are not authenticated as any particular end user; there is no `auth.uid()`
-- to check a policy against). Service role bypasses RLS entirely.

create index if not exists billing_events_user_idx
  on public.billing_events (user_id, created_at desc) where user_id is not null;
