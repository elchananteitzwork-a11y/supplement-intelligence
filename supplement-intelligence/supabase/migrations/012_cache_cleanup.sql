-- ── Provider cache automatic cleanup ──────────────────────────────────────
-- Schedules a pg_cron job to delete expired rows from provider_cache daily.
-- This prevents unbounded table growth from accumulated TTL-expired entries.
--
-- pg_cron availability:
--   Supabase Pro projects: pg_cron is pre-installed and available.
--   Free/Starter projects: pg_cron may not be available — the DO block below
--     handles both cases gracefully; no error is raised if it's absent.
--
-- Manual cleanup (safe to run at any time):
--   DELETE FROM public.provider_cache WHERE expires_at < now();

do $$
begin
  -- Only attempt to schedule if pg_cron is installed
  if exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    perform cron.schedule(
      'provider-cache-cleanup',   -- job name (idempotent: re-running this migration is safe)
      '0 3 * * *',                -- daily at 03:00 UTC, off-peak
      $$DELETE FROM public.provider_cache WHERE expires_at < now()$$
    );
  end if;
end;
$$;

-- Fallback: a partial index that makes manual cleanup fast even on large tables.
-- The index on expires_at already exists from migration 010; this comment
-- documents that the pattern DELETE … WHERE expires_at < now() is the
-- intended maintenance path when pg_cron is unavailable.
