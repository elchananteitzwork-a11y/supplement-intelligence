-- ── Milestone 1: Product Intelligence Pipeline — Stage 0–4 tables ───────────
-- All new tables use uuid primary keys, enable RLS, and restrict access to
-- the row owner (auth.uid() = user_id). No data from one user is readable
-- by another. Service role bypasses RLS for internal operations.

-- Stage 0: Founder profiles
create table public.founder_profiles (
  id                       uuid primary key default uuid_generate_v4(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  capital_available        numeric not null,
  capital_confidence       text not null check (capital_confidence in ('committed','estimated','speculative')),
  manufacturing_experience text not null check (manufacturing_experience in ('none','sourced_before','established_relationships')),
  regulatory_experience    text not null check (regulatory_experience in ('none','familiar','certified')),
  channel_type             text not null check (channel_type in ('none','social_audience','email_list','retail_relationships','wholesale','multiple')),
  channel_size             numeric,
  target_geography         text not null check (target_geography in ('us_only','multi_region','international')),
  time_horizon             text not null check (time_horizon in ('under_6mo','6_to_18mo','18_plus_mo')),
  risk_posture             text not null check (risk_posture in ('capital_preservation','balanced','high_risk_tolerance')),
  long_term_goal           text not null check (long_term_goal in ('lifestyle_business','scale_to_exit','strategic_asset'))
);
alter table public.founder_profiles enable row level security;
create policy "fp_owner_all" on public.founder_profiles for all using (auth.uid() = user_id);
create index fp_user_idx on public.founder_profiles (user_id);

-- Trigger: keep updated_at current
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger founder_profiles_updated_at
  before update on public.founder_profiles
  for each row execute function public.set_updated_at();

-- Stage 1: Market signals (structured Stage 1 output with EvidencePoint data)
create table public.market_signals (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  query              text not null,
  category_id        text,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null default (now() + interval '30 days'),
  quality_grade      text not null check (quality_grade in ('sufficient','thin','insufficient')),
  quality_detail     jsonb not null default '{}',
  pipeline_blocked   boolean not null default false,
  blocked_reason     text,
  signal_data        jsonb not null default '{}',
  provider_metadata  jsonb not null default '{}'
);
alter table public.market_signals enable row level security;
create policy "ms_owner_all" on public.market_signals for all using (auth.uid() = user_id);
create index ms_user_created_idx on public.market_signals (user_id, created_at desc);
create index ms_query_idx on public.market_signals (query, created_at desc);

-- Stage 2: Investment theses (Stage 2 AI synthesis output)
create table public.investment_theses (
  id                      uuid primary key default uuid_generate_v4(),
  market_signal_id        uuid not null references public.market_signals(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  created_at              timestamptz not null default now(),
  thesis_index            int not null,
  product_angle           text not null,
  target_customer         text not null,
  differentiation         text not null,
  differentiation_source  text not null,
  customer_pain           jsonb not null,
  supporting_evidence     jsonb not null default '[]',
  quick_economics_check   jsonb not null,
  ai_model_version        text not null
);
alter table public.investment_theses enable row level security;
create policy "it_owner_all" on public.investment_theses for all using (auth.uid() = user_id);
create index it_signal_idx on public.investment_theses (market_signal_id);
create index it_user_idx on public.investment_theses (user_id, created_at desc);

-- Stage 2.5: Founder-opportunity fit annotations
create table public.founder_fit_annotations (
  id                   uuid primary key default uuid_generate_v4(),
  thesis_id            uuid not null references public.investment_theses(id) on delete cascade,
  founder_profile_id   uuid not null references public.founder_profiles(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  created_at           timestamptz not null default now(),
  fit_rank             int not null,
  capital_fit          jsonb not null,
  experience_gaps      jsonb not null default '[]',
  channel_fit          jsonb not null,
  timeline_fit         jsonb not null,
  advantages           text[] not null default '{}',
  gaps                 text[] not null default '{}'
);
alter table public.founder_fit_annotations enable row level security;
create policy "ffa_owner_all" on public.founder_fit_annotations for all using (auth.uid() = user_id);
create index ffa_thesis_profile_idx on public.founder_fit_annotations (thesis_id, founder_profile_id);

-- Stage 3: Adversarial debates
create table public.adversarial_debates (
  id                  uuid primary key default uuid_generate_v4(),
  thesis_id           uuid not null references public.investment_theses(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  created_at          timestamptz not null default now(),
  bull_case           jsonb not null,
  bear_case           jsonb not null,
  conflicts           jsonb not null default '[]',
  unknowns            jsonb not null default '[]',
  kill_switches       jsonb not null default '[]',
  all_switches_clear  boolean not null,
  ai_model_version    text not null
);
alter table public.adversarial_debates enable row level security;
create policy "ad_owner_all" on public.adversarial_debates for all using (auth.uid() = user_id);
create index ad_thesis_idx on public.adversarial_debates (thesis_id);

-- Stage 4: Investment memos
create table public.investment_memos (
  id                     uuid primary key default uuid_generate_v4(),
  thesis_id              uuid not null references public.investment_theses(id) on delete cascade,
  debate_id              uuid not null references public.adversarial_debates(id) on delete cascade,
  founder_profile_id     uuid references public.founder_profiles(id) on delete set null,
  user_id                uuid not null references auth.users(id) on delete cascade,
  created_at             timestamptz not null default now(),
  founder_stage4_inputs  jsonb not null default '{}',
  sections               jsonb not null,
  market_verdict         jsonb not null,
  founder_verdict        jsonb,
  verdict_divergence     text,
  freshness_notice       text not null,
  ai_model_version       text not null
);
alter table public.investment_memos enable row level security;
create policy "im_owner_all" on public.investment_memos for all using (auth.uid() = user_id);
create index im_thesis_idx on public.investment_memos (thesis_id);
create index im_user_created_idx on public.investment_memos (user_id, created_at desc);
