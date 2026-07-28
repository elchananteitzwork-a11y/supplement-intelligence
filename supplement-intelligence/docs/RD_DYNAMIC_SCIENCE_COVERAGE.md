# R&D: Dynamic Science Coverage — queried-ingredient first milestone

Owner-approved direction 2026-07-28, after the production E2E run
("Ashwagandha Gummies for Stress") produced a full analysis with the
science dimension entirely absent — live evidence of what the fixed
3-ingredient cap costs on a product category whose buyers evaluate by
studies. Builds on the completed 2026-07-18 architecture/rate-limit
research (memory: project-dynamic-ingredient-coverage-deferred) — do not
re-derive it.

## 1. Reuse audit

- **The query→ingredient dictionary match already exists as the
  production mechanism.** `lib/signal-engine/providers/science.ts:32-35`:
  `matchTrackedIngredient(ctx.query)` → honest `null` on miss →
  `cacheGet('science:v1:${ingredient}')` → honest `null` when the nightly
  batch hasn't populated it. This milestone widens the vocabulary and adds
  a demand-driven queue; it does NOT invent a new matching mechanism, and
  the no-NLP/no-fabrication discipline (exact match or nothing) is already
  the file's own convention (`tracked-ingredients.ts:14-18` header).
- **The nightly worker already exists.** `app/api/cron/science-pipeline/
  route.ts` (`maxDuration = 60`, route.ts:48) → `runSciencePipeline`
  iterating `TRACKED_INGREDIENTS` (`lib/science-engine/pipeline.ts:170`),
  sequential by design to protect PubMed's shared 3/sec (unkeyed) global
  limit, ~2.1s floor per ingredient (6 per-year lookups × 350ms
  self-throttle) — all confirmed live 2026-07-18.
- **Storage already exists**: `provider_cache` via `cacheGet`/`cacheSet`
  (`science:v1:*` keys). TTL semantics (30h) are a real open question for
  queue-driven entries — see Risks.
- **The fixed list is soft scope, not a technical ceiling** —
  `tracked-ingredients.ts:19` (`['berberine','creatine','magnesium']`),
  documented as MVP benchmark discipline in its own header.
- **Ingredient-name vocabulary source**: NIH DSLD is already an integrated,
  real provider in this codebase; its ingredient nomenclature can seed a
  curated static vocabulary file (human-reviewed once, checked into the
  repo — data, not code; no runtime DSLD dependency for matching).

## 2. Existing architecture touched

- `matchTrackedIngredient` widens to match against the new vocabulary
  (same exact-match semantics; longest-match-wins for multiword names).
- The science cron gains a queue-drain phase AFTER the existing tracked-3
  refresh, budget-bounded (see §3.4). The tracked 3 keep absolute priority
  — benchmark continuity untouched.
- `app/api/generate/route.ts` — one enqueue call at the point where the
  science provider returned null but the vocabulary matched (no new fetch
  in-request; live/synchronous science fetch remains forbidden per the
  2026-07-18 rate-limit findings).
- Scoring/confidence/verdict math: untouched. A newly-covered ingredient
  simply starts producing the same ScienceSignal the 3 tracked ones do.

## 3. Files to change

1. `lib/science-engine/ingredient-vocabulary.ts` (new, data): curated
   array of real ingredient names (~150-250 entries, DSLD-derived,
   human-reviewed; lowercase canonical + aliases). Exact-match only.
2. `lib/science-engine/tracked-ingredients.ts`: `matchTrackedIngredient`
   extended to consult the vocabulary after the tracked 3 (tracked names
   win ties; behavior for the existing 3 byte-identical).
3. `supabase/migrations/032_science_ingredient_queue.sql` (new; RLS review
   required): `science_ingredient_queue` — `ingredient text primary key`,
   `first_requested_at`, `last_requested_at`, `request_count int`,
   `fetched_at timestamptz null`. No user_id (global demand signal, not
   user data); writes only via service role from generate/cron — RLS
   locked to no client access (same lockdown pattern as migration 014).
4. `app/api/generate/route.ts`: on vocabulary-match + science-cache-miss →
   service-role upsert into the queue (increment request_count) — fire-and-
   forget, never blocks or fails the analysis.
5. `app/api/cron/science-pipeline/route.ts` + `lib/science-engine/
   pipeline.ts`: after the tracked-3 refresh, drain up to
   `QUEUE_BUDGET_PER_NIGHT = 15` unfetched queue rows (oldest
   first_requested_at first), reusing the exact same per-ingredient fetch
   path; mark `fetched_at`. 3 tracked (~7s) + 15 queued (~32s) ≈ 39s,
   inside the 60s maxDuration with headroom; the budget constant is the
   single knob if the ceiling ever moves.
6. Report-side honesty line: where the memo renders science absence for a
   vocabulary-matched ingredient, say "Science evidence for {ingredient}
   is queued — it will appear on a future re-check", instead of silent
   absence. (Exact surface: the evidence-coverage line's existing honest-
   absence path; no new component.)
7. Tests: vocabulary match (incl. multiword/alias/miss), queue upsert
   idempotency, cron drain budget + ordering, tracked-3 priority
   unchanged.

## 4. Risks

- **PubMed 429s at higher volume**: real transient 429s already occur at 3
  ingredients (M2.18 live validation). The drain stays sequential with the
  same throttle and the same graceful-degradation layers; the per-night
  budget (15) keeps total nightly volume ~6× today's — if 429 rates climb,
  the budget is the knob. Never parallelize the PubMed path.
- **provider_cache TTL (30h) vs queue-driven entries**: a queued ingredient
  fetched once would expire and go silent again unless re-refreshed. The
  drain therefore ALSO re-refreshes previously-fetched queue rows whose
  cache entry is near expiry, within the same budget, most-requested
  first — demand-weighted retention instead of a cache-semantics rewrite.
  (Fetched-but-expired is the same honest-absence state as today.)
- **Vocabulary quality**: a curated static list can miss niche compounds —
  a miss degrades to today's exact behavior (honest absence), never a
  wrong match. Additions are one-line data PRs.
- **Cron duration creep**: budget arithmetic above leaves ~20s headroom;
  the drain aborts cleanly on a time check before each ingredient (same
  pattern as generate's own budget guards).
- **Queue table is service-role-only** — security review must confirm the
  RLS lockdown (no anon/authenticated access at all).

## 5. Testing plan

- Unit tests per §3.7; `npx tsc --noEmit`; full vitest; build.
- Live validation (real, cheap): seed the queue with 'ashwagandha' via the
  real generate path (one analysis on the owner's account), run the cron
  route once manually, confirm `science:v1:ashwagandha` materializes in
  provider_cache with real PubMed/CT.gov data, then re-run the analysis
  and confirm the science dimension appears with real studies.
- Confirm the tracked-3 benchmark set still refreshes first (cron logs).

## 6. Smallest-correct-scope

One data file, one widened matcher, one queue table, one enqueue call, one
bounded drain phase in the existing cron, one honesty line, tests. No new
providers, no worker infrastructure, no parallel PubMed, no cache
rewrite, no in-request fetching.

## 7. Non-goals

- **No free-text/listing-copy ingredient extraction** — the 2026-07-18
  "extraction-without-fabrication" problem stays open and out of scope;
  this milestone covers only ingredients the user's own query names.
- **No live in-request science fetch** (rate-limit findings stand).
- **No multi-ingredient formulas** (a query naming two ingredients gets
  the first/longest match only, disclosed in the matcher's comment).
- **No scoring weight changes** — coverage widens; the math doesn't move.
- **No queue UI/admin surface** — the cron log is the observability for
  now.
