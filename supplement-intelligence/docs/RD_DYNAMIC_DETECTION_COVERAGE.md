# R&D: Dynamic Detection Coverage — scan what the queue already feeds

Owner-directed 2026-08-04 ("build a plan"). Follow-on unlocked by Dynamic
Science Coverage (docs/RD_DYNAMIC_SCIENCE_COVERAGE.md, live since
2026-07-30): the nightly queue drain now writes real niche_timeseries
observations for every demanded ingredient, but the nightly Discovery and
Divergence detectors still scan only the 3 benchmark TRACKED_INGREDIENTS —
real accumulated history that no detector ever looks at. This milestone
widens the detectors' candidate list to the queue-drained ingredients.
Strategic side effect: divergence_alerts starts carrying niche_keys (e.g.
'ashwagandha') that the widened 183-ingredient matchTrackedIngredient can
map to users' watched category names — the exact mapping gap that has
blocked the 'moved' state / DeltaBanner since 2026-07-24
(production-blockers memory). This milestone builds NO UI; it makes the
data real so that future UI milestone has something true to show.

## 1. Reuse audit

- **Both detectors are already category-agnostic by design** and need zero
  changes: `runDiscoveryDetection(candidateNicheKeys, now,
  observationsByNicheKey?)` (`lib/discovery-engine/run.ts:44-48`) and
  `runDivergenceDetection(...)` (`lib/divergence-detector/run.ts:43-47`)
  take the candidate list as a PARAMETER; their own header comments state
  the candidate list is "a wiring choice at that call site, not an
  assumption baked into this engine".
- **The observations the new candidates need already exist**: the queue
  drain's `ingestScienceSignal` writes niche_timeseries rows under
  `nicheKey = ingredient` for every drained ingredient
  (`lib/science-engine/pipeline.ts:141-158`) — live in production since
  2026-07-30. Demand-weighted re-refresh (30h TTL, near-expiry pass) means
  demanded ingredients accumulate roughly nightly observations, giving the
  detectors the ≥2-point history they require within days.
- **The candidate enumeration helper already exists**:
  `getFetchedQueueRowsByDemand(limit)` (`lib/science-engine/queue.ts:83`)
  returns fetched queue rows most-demanded first — exactly the bounded,
  demand-ordered list the scan should use. Zero new DB surface.
- **The shared-read optimization already exists**: the cron route
  prefetches `getRecentObservations(nicheKey)` once per candidate and
  hands the map to both detectors (`app/api/cron/science-pipeline/
  route.ts:78-85`) — the extension reuses this exact loop.
- **The time-guard pattern already exists**: `ROUTE_ELAPSED_CEILING_MS`
  (drain phase, `lib/science-engine/pipeline.ts`) — same
  measured-from-route-start elapsed-guard convention applies to bounding
  the detection scan.

## 2. Existing architecture touched (read-only / call-site only)

- `app/api/cron/science-pipeline/route.ts` — the ONLY file whose behavior
  changes: candidate list widens from `[...TRACKED_INGREDIENTS]` to
  tracked-3 + a bounded slice of fetched queue ingredients.
- `lib/science-engine/queue.ts` — `getFetchedQueueRowsByDemand` reused
  as-is.
- Detectors, stores, alert tables, RLS: untouched (alert tables are
  append-only, service-role-only; niche_key is already free-text by
  design — migration 026/027 comments).

## 3. Files to change

1. `app/api/cron/science-pipeline/route.ts`:
   - After the drain, build the detection candidate list:
     `[...TRACKED_INGREDIENTS, ...fetchedQueueIngredients]` where
     `fetchedQueueIngredients = (await getFetchedQueueRowsByDemand(
     DETECTION_QUEUE_CANDIDATES_PER_NIGHT)).map(r => r.ingredient)`,
     deduped against the tracked-3 (a tracked ingredient never sits in
     the queue by design, but dedupe defensively).
   - `DETECTION_QUEUE_CANDIDATES_PER_NIGHT = 30` — disclosed, uncalibrated
     initial value, same convention as QUEUE_BUDGET_PER_NIGHT. Bounds the
     per-candidate niche_timeseries reads (~1 query each) so the
     detection phase stays well inside the 60s maxDuration after the
     drain's own 45s ceiling. Demand-ordered (most-requested first) —
     the same demand-weighted-attention philosophy as the drain itself;
     rotation fairness for the long tail is deliberately NOT built (see
     Non-goals).
   - **Freshness filter (adversarial-critique fix, 2026-08-04)**: only
     queue rows with `fetched_at` inside `DETECTION_FRESH_WINDOW_MS`
     (48h) become candidates. Root cause: alerts dedupe on
     (niche_key, source, metric, detected_at) and `detectedAt = now`
     (lib/discovery-engine/run.ts:66) — an UNCHANGED series that once
     crossed a threshold would re-record the identical alert every
     night until its next refresh (a queue ingredient not re-refreshed
     for a week ⇒ 7 duplicate alerts on identical data; invisible on
     the tracked-3, which always gain a fresh nightly point). Scanning
     only freshly-refreshed candidates removes the spam structurally
     and aligns the effective candidate count with the drain's real
     ~15/night refresh capacity.
   - Same elapsed-time check before the detection loop as the drain uses:
     if the route is already past its ceiling, run detection for the
     tracked-3 only (benchmark continuity first) and log the skip count.
   - Log line gains `detectionCandidates: n` for observability.
2. `lib/science-engine/pipeline.ts` (second critique fix):
   `QUEUE_NEAR_EXPIRY_MS` 0.2 → 0.3 of TTL (6h → 9h). The 24h cron
   cadence against the 30h TTL leaves exactly 6h to expiry at scan time
   — a knife-edge equality where minutes of Vercel cron jitter skip a
   night's re-refresh (and thus a night's observation). 9h gives the
   nightly re-refresh real margin; still refreshes at most once per
   night, so PubMed volume is unchanged.
3. `lib/science-engine/pipeline.ts` (live-validation-found bug, second
   fix): a FETCHED queue row whose cache entry was purged (null
   expiresAt) was permanently skipped by the old `expiresAt !== null &&`
   guard — fetched_at set, cache gone, never re-refreshed again.
   Production evidence during this milestone's validation: ashwagandha's
   nightly observations stopped 2026-08-03 exactly at the 6h knife-edge,
   its cache expired 14:54 that day, and one lazy purge stood between it
   and permanent darkness. Fixed: null expiresAt now counts as
   needs-re-refresh (the worst staleness case, not a skip).
4. Tests (`app/api/cron/science-pipeline/__tests__/route.test.ts` + pipeline tests):
   candidate list = tracked-3 + demand-ordered fetched queue ingredients,
   capped; queue-read failure degrades to tracked-3 only (never fails the
   route); detection ordering after drain unchanged; observations map
   fetched once per candidate.

## 4. Risks

- **Cron duration creep**: +N candidates ⇒ +N niche_timeseries reads
  (fast indexed queries) after a phase already bounded at 45s. Mitigated
  by the cap (30) + the elapsed-guard fallback to tracked-3-only. The
  measured baseline (13.5s total on 2026-07-30's live run with 1 queued
  ingredient) leaves wide headroom.
- **Alert noise from thin series**: a queue ingredient's first nights
  produce 1-2 points; detectors already return no-alert on insufficient
  history (detectAcceleration/detectSeriesDivergence handle short series
  — existing tested behavior), so early noise is structurally absent
  rather than filtered.
- **Long-tail starvation** (candidate #31+ never scanned): real but
  bounded — the queue itself is structurally capped (~183 vocabulary
  ingredients) and demand-ordered scanning matches how the product
  already prioritizes everything else. Disclosed; revisit only if real
  users demonstrably sit beyond the cap.
- **Alert-table growth**: append-only with unique constraints per
  (niche_key, series, detected_at); ~30 candidates × rare crossings is
  negligible volume.

## 5. Testing plan

- Unit tests per §3.2; `npx tsc --noEmit`; full vitest; build.
- Live validation (free — DB reads + one manual cron trigger): trigger
  the cron once against production, confirm the response's
  `detectionCandidates` includes the drained queue ingredients (e.g.
  'ashwagandha' from the 2026-07-30 validation), and that
  discovery/divergence results report candidatesChecked > 3. Alerts may
  legitimately be zero (crossings are rare and history is young) —
  the assertion is coverage, not alert count.
- Confirm tracked-3 detection results unchanged on the same run.

## 6. Smallest-correct-scope

One call-site change in the cron route, one disclosed cap constant, one
elapsed-guard reuse, tests. No detector changes, no schema changes, no
new reads beyond the existing per-candidate pattern, no UI.

## 7. Non-goals

- **No DeltaBanner / 'moved' state / any UI** — this milestone makes the
  underlying alert data real for dynamically-covered niches; the UI
  milestone (RD_V4_PHASE2 Milestone D, deliberately unshipped) remains
  its own future work with its own R&D, now genuinely unblocked.
- **No rotation/fairness scheduling for the long tail** — demand-ordered
  cap only; a scheduling scheme has no evidence it's needed yet.
- **No detector algorithm changes** (thresholds, cross-source
  confirmation, hype filtering — same deliberate exclusions as M2.12/
  M2.22).
- **No niche_key→category_name mapping table** — the widened
  matchTrackedIngredient already provides the mapping mechanism for the
  future UI milestone; building a persisted mapping now would be
  speculative.
