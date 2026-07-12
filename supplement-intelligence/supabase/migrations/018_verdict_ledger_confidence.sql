-- ── Verdict Ledger — independence-aware confidence columns ─────────────────
-- V2 Blueprint §10 / Roadmap M1.4 (confidence math half). Purely additive:
-- new nullable columns on the existing verdict_ledger table (migration 017).
-- No existing column, constraint, trigger, or policy is touched.
--
-- Deliberately NOT using the pillar_confidence column added in 017: that
-- column is reserved for the true four-pillar aggregation (Roadmap M2.4),
-- which does not exist yet. What this migration adds is confidence at
-- TODAY's real granularity — the 7 scoring dimensions — computed by
-- lib/confidence/independence.ts. pillar_confidence stays null until M2.4
-- ships; renaming or repurposing it now would create a silent semantic
-- mismatch between the column name and the data actually stored in it.

alter table public.verdict_ledger
  add column if not exists dimension_confidence  jsonb,   -- DimensionConfidence[] from lib/confidence
  add column if not exists overall_confidence     numeric, -- weakest-link composite, 0-1
  add column if not exists weakest_dimension      text,    -- which dimension set the composite
  add column if not exists confirming_channel_count int,   -- distinct channels across all verified dimensions
  add column if not exists confidence_model_version text;  -- lib/confidence CONFIDENCE_MODEL_VERSION at write time

comment on column public.verdict_ledger.dimension_confidence is
  'Per-dimension independence-aware confidence (today''s 7-dimension model), from lib/confidence/independence.ts. Not the same as pillar_confidence (reserved for the future 4-pillar model, Roadmap M2.4).';
comment on column public.verdict_ledger.overall_confidence is
  'Weakest-link composite: min(confidence) across verified dimensions. Never an average.';
