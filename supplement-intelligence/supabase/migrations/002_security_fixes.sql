-- ─────────────────────────────────────────────────────────────────
-- Fix 1: Leaderboard write policies
-- The generate API route needs to INSERT/UPDATE the leaderboard.
-- Without these policies all leaderboard writes fail silently.
-- ─────────────────────────────────────────────────────────────────
create policy "authenticated insert leaderboard" on public.leaderboard
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated update leaderboard" on public.leaderboard
  for update using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────
-- Fix 2: Atomic rate-limit slot consumption
-- Replaces the read-then-update pattern that has a TOCTOU race.
-- Returns TRUE if a slot was consumed, FALSE if already at limit.
-- Called from the generate API route before invoking Claude.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.consume_analysis_slot(p_user_id uuid)
returns boolean language plpgsql security definer as $$
declare
  rows_updated int;
begin
  update public.profiles
  set analyses_used = analyses_used + 1
  where id = p_user_id
    and analyses_used < analyses_limit;

  get diagnostics rows_updated = row_count;
  return rows_updated > 0;
end;
$$;
