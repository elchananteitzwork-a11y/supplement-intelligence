-- ─────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────────
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  analyses_used   int  not null default 0,
  analyses_limit  int  not null default 3,
  created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "owner select" on public.profiles for select using (auth.uid() = id);
create policy "owner update" on public.profiles for update using (auth.uid() = id);

create or replace function public.on_auth_user_created()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.on_auth_user_created();

-- ─────────────────────────────────────────────
-- ANALYSES
-- ─────────────────────────────────────────────
create table public.analyses (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  created_at              timestamptz not null default now(),

  raw_input               text not null,
  category_name           text not null,
  target_audience         text,
  price_point             text,

  score_demand            numeric(3,1),
  score_competition       numeric(3,1),
  score_virality          numeric(3,1),
  score_subscription      numeric(3,1),
  score_manufacturing     numeric(3,1),
  score_defensibility     numeric(3,1),
  opportunity_score       numeric(5,1),

  build_decision          text check (build_decision in ('BUILD_NOW','VALIDATE_FURTHER','SKIP')),
  build_verdict           text check (build_verdict in ('YES','MAYBE','NO')),

  memo_data               jsonb not null,

  biggest_competitor      text,
  market_size             text,
  sub_ltv                 text,
  gross_margin            text,

  generation_ms           int,
  model_version           text not null default 'claude-sonnet-4-6',
  is_archived             boolean not null default false
);

create index on public.analyses (user_id, created_at desc);
create index on public.analyses (opportunity_score desc);

alter table public.analyses enable row level security;

create policy "owner all" on public.analyses for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- LEADERBOARD
-- ─────────────────────────────────────────────
create table public.leaderboard (
  id                uuid primary key default uuid_generate_v4(),
  category_name     text unique not null,
  opportunity_score numeric(5,1),
  build_decision    text,
  biggest_competitor text,
  market_size       text,
  sub_ltv           text,
  analysis_count    int not null default 1,
  best_analysis_id  uuid,
  last_analyzed     timestamptz not null default now()
);

create index on public.leaderboard (opportunity_score desc);

alter table public.leaderboard enable row level security;

create policy "authenticated read" on public.leaderboard
  for select using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- FEEDBACK
-- ─────────────────────────────────────────────
create table public.feedback (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id) on delete set null,
  analysis_id  uuid references public.analyses(id) on delete cascade,
  rating       int check (rating between 1 and 5),
  category     text,
  comment      text,
  created_at   timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "owner insert" on public.feedback for insert with check (auth.uid() = user_id);
create policy "owner select" on public.feedback for select using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- SEED: 28 pre-researched categories
-- ─────────────────────────────────────────────
insert into public.leaderboard
  (category_name, opportunity_score, build_decision, biggest_competitor, market_size, sub_ltv)
values
  ('Bloating + Fatigue',      80, 'BUILD_NOW',        'Arrae',          '$14.4B', '$294'),
  ('Bloating Relief',         78, 'BUILD_NOW',        'Arrae',          '$14.4B', '$270'),
  ('Hormonal Acne + Gut',     77, 'BUILD_NOW',        'CLEARSTEM',      '$5.5B',  '$375'),
  ('Perimenopause Support',   75, 'BUILD_NOW',        'Bonafide',       '$8B+',   '$420'),
  ('Menopause Weight Gain',   75, 'BUILD_NOW',        'Estroven',       '$5.5B',  '$380'),
  ('PCOS Weight Loss',        73, 'BUILD_NOW',        'Ovasitol',       '$3.2B',  '$310'),
  ('Anxiety + Gut',           73, 'BUILD_NOW',        'Atrantil',       '$6B+',   '$300'),
  ('Cortisol Support',        72, 'BUILD_NOW',        'Moon Juice',     '$4B+',   '$280'),
  ('Hair Loss + Stress',      72, 'BUILD_NOW',        'Nutrafol',       '$1.87B', '$470'),
  ('Stress Shedding',         72, 'BUILD_NOW',        'Nutrafol',       '$1.87B', '$440'),
  ('Postpartum Recovery',     70, 'VALIDATE_FURTHER', 'Needed',         '$1.2B',  '$350'),
  ('GLP-1 Support',           70, 'VALIDATE_FURTHER', 'Pendulum',       '$2B+',   '$240'),
  ('Insulin Resistance',      70, 'VALIDATE_FURTHER', 'Thorne',         '$4B+',   '$260'),
  ('Hair Growth Women',       68, 'VALIDATE_FURTHER', 'Nutrafol',       '$1.87B', '$400'),
  ('IBS Relief',              68, 'VALIDATE_FURTHER', 'IBgard',         '$3.5B',  '$280'),
  ('Blood Sugar Support',     67, 'VALIDATE_FURTHER', 'Glucofit',       '$4B+',   '$250'),
  ('Women''s Libido',         65, 'VALIDATE_FURTHER', 'Femmenessence',  '$1.5B',  '$230'),
  ('Brain Fog',               63, 'VALIDATE_FURTHER', 'Thesis',         '$2B+',   '$240'),
  ('Hormone Balance',         63, 'VALIDATE_FURTHER', 'HUM Nutrition',  '$8B+',   '$240'),
  ('Digestive Enzymes',       63, 'VALIDATE_FURTHER', 'Enzymedica',     '$3B+',   '$210'),
  ('Sleep Optimization',      63, 'VALIDATE_FURTHER', 'Olly',           '$5.5B',  '$220'),
  ('Focus Gummies',           62, 'VALIDATE_FURTHER', 'Lemme',          '$2B+',   '$200'),
  ('Chronic Fatigue',         58, 'SKIP',             null,             '$2B+',   null),
  ('Female Energy',           58, 'SKIP',             'AG1',            '$6B+',   null),
  ('ADHD Focus',              58, 'SKIP',             'Thesis',         '$1.5B',  null),
  ('Leaky Gut',               58, 'SKIP',             'Dr. Axe',        '$800M',  null),
  ('Mood Support',            55, 'SKIP',             null,             '$4B+',   null),
  ('Joint Pain',              52, 'SKIP',             'Move Free',      '$4.5B',  null)
on conflict (category_name) do nothing;
