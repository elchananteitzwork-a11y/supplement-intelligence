-- Defensive replacement for consume_analysis_slot.
-- Adds an auto-upsert of the profiles row so the function never fails
-- when the on_auth_user_created trigger missed a user (e.g. existing
-- accounts created before the trigger was added, or trigger failure).
-- Safe to run multiple times (CREATE OR REPLACE).

create or replace function public.consume_analysis_slot(p_user_id uuid)
returns boolean language plpgsql security definer as $$
declare
  rows_updated int;
begin
  -- Ensure a profiles row exists. SECURITY DEFINER lets us read auth.users.
  -- on conflict do nothing is a no-op if the row is already there.
  insert into public.profiles (id, email)
  select p_user_id, email
  from auth.users
  where id = p_user_id
  on conflict (id) do nothing;

  -- Atomically consume one slot if under the limit.
  update public.profiles
  set    analyses_used = analyses_used + 1
  where  id            = p_user_id
    and  analyses_used < analyses_limit;

  get diagnostics rows_updated = row_count;
  return rows_updated > 0;   -- true = slot granted, false = limit reached
end;
$$;
