-- Refunds one analysis slot to a user.
-- Called server-side when the slot was consumed but the DB insert failed,
-- so the user is not penalised for an infrastructure error.
-- Uses greatest(0, ...) to prevent the counter going negative.
-- Safe to call multiple times (idempotent in the worst case).
create or replace function public.refund_analysis_slot(p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.profiles
  set    analyses_used = greatest(0, analyses_used - 1)
  where  id = p_user_id;
end;
$$;
