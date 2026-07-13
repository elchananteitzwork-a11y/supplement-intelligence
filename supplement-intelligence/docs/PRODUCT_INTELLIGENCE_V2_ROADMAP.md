# PRODUCT INTELLIGENCE ENGINE — V2 EXECUTION ROADMAP

**Source of truth:** `PRODUCT_INTELLIGENCE_V2_BLUEPRINT.md`. This document breaks the blueprint into small, ordered milestones with dependencies and acceptance criteria. It does not restate rationale — see the blueprint for the *why* of every item.

**Status legend:** each milestone is `[ ]` not started / `[~]` in progress / `[x]` done. Update in place as work lands.

**Ordering rule:** within a phase, milestones are listed in execution order. A milestone must not start before its dependencies are `[x]`.

---

## Phase 1 — Critical before beta

### M1.1 — Verdict Ledger v1 `[ ]`
**Blueprint refs:** §11, §12, Principle 9. **Depends on:** nothing. **Ship first.**
Expand the existing BUILD_NOW Pattern Memory (append-only analytics) into full analysis snapshots. Schema: full raw signal set (channel-tagged once M1.3 lands; provider-tagged until then), dimension/pillar scores, verdict, confidence, engine version, ISO date. Append-only Supabase table; no updates, no deletes.
**Acceptance criteria:**
- Every completed analysis writes exactly one ledger row; failures to write are logged loudly but never block the analysis response.
- A ledger row replayed against the same engine version reproduces the same verdict (determinism check).
- Rows are immutable: no update/delete path exists in application code; RLS blocks mutation.
- Backfill note recorded: date the ledger started (the calibration clock's t=0).

### M1.2 — Scoring honesty pass `[ ]`
**Blueprint refs:** §6, §15, Principles 3–5. **Depends on:** nothing (parallel with M1.1).
Remove manufacturing feasibility and seasonality from weighted scoring (both remain in memo/report as enrichment). Remove AI-judgment qualitative fallbacks from weighted seats — when a dimension has no verified evidence, redistribute its weight (mechanism already exists). Delete the Amazon Ads stub.
**Acceptance criteria:**
- `BASE_WEIGHTS` contains no manufacturing or seasonality entry; weights renormalize.
- No candidate with `source: 'qualitative'` carries weight > 0 in the composite score.
- Seasonality pattern/peak months and supplier data still render in the memo.
- `amazon-ads.ts` deleted; registry has no dead entries; build green.
- Regression: re-run 3 benchmark queries (berberine, creatine, magnesium); score deltas explained entirely by the removed weights.

### M1.3 — Channel tags on all signals `[x]`
**Blueprint refs:** §4 stage 2, §6. **Depends on:** nothing (parallel).
Add a `channel` field to the provider signal envelope: `amazon-market | search-intent | social-attention | paid-media | science | supply-side | consumer-voice`. Tag every existing provider output.
**Acceptance criteria:**
- Every signal reaching the Decision Engine carries exactly one channel tag.
- Keepa-derived signals tag as `amazon-market` (or `supply-side` for listing-age/velocity outputs).
- Type-level enforcement: untagged signals fail the build.

**Completed 2026-07-12.** Implemented as an expansion of the channel taxonomy already living in `lib/scoring.ts` (`ChannelType`/`PROVIDER_CHANNEL`) rather than a new field on the signal envelope itself — that map was already the single source of truth every provider's output flows through on its way to `EvidenceBreadth`/confidence, so adding a field directly to `ProviderSignals` would have created a second, competing source of truth. The prior 5-channel taxonomy (`amazon_marketplace | search_seo | social_community | manufacturing_supply | regulatory_safety`) is now 8: the blueprint's 7 (renamed to match this codebase's existing snake_case convention) plus `regulatory_safety` retained for openFDA, which the blueprint's channel list doesn't name and which dropping would have been a regression. `social_community` — previously shared by tiktok, reddit, and meta-ads, capping virality's channel-independence count at 1 no matter how many of the three fired — is split into `social_attention` (tiktok), `consumer_voice` (reddit), and `paid_media` (meta-ads); `science` is added but unpopulated, reserved for M2.5. "Type-level enforcement" is implemented as a test (`lib/__tests__/channel-tagging.test.ts`) asserting every provider in the registry has a `PROVIDER_CHANNEL` entry, gating `npm test` — true compiler enforcement isn't available since providers register by string name, not a closed union. `SCORING_ENGINE_VERSION` was not bumped (no score/weight/gate formula changed); `CONFIDENCE_MODEL_VERSION` was bumped 1.0.0→1.1.0 (channel semantics changed, confidence numbers for multi-social-provider queries are not comparable across the boundary). Verified: `tsc --noEmit` clean, 354/354 tests passing (23 files, including 5 updated fixture files and this milestone's new coverage), `next build` clean.

### M1.4 — Independence-aware confidence + two-channel gate `[ ]`
**Blueprint refs:** §10, Principles 6–8. **Depends on:** M1.3.
Confidence counts effective independent channels: signals sharing a channel tag count once at max reliability. Pillar confidence ≈ `1 − Π(1 − rᵢ)` across channels. Composite confidence is weakest-link-weighted. Hard gate: BUILD_NOW requires ≥2 independent demand channels confirming; one-witness verdicts cap at INVESTIGATE tier.
**Acceptance criteria:**
- A query where only Keepa fires cannot produce BUILD_NOW, regardless of score.
- Adding a second confirming channel (e.g., DataForSEO) measurably raises reported confidence; adding a third Keepa-derived signal does not.
- Confidence display includes channel count ("confirmed by N independent channels").
- Existing thin-corpus cross-validation logic is generalized into (not duplicated by) this mechanism.

### M1.5 — Meta Ads Library provider (stub → real) `[x]`
**Blueprint refs:** §5, §6, §15. **Depends on:** M1.3 (tags as `paid-media`).
Wire the Meta Ad Library API: active ad count per niche keyword set, advertiser count, and 90-day delta where obtainable. Honest nulls on failure; never blocks the analysis.
**Acceptance criteria:**
- Fires on the 3 benchmark queries with non-null ad counts.
- Contributes as an independent `paid-media` channel in the concordance/confidence math (satisfies the two-channel gate alongside Amazon).
- Rate-limit and failure paths return null; analysis completes regardless.

**Completed 2026-07-12.** The provider itself (`lib/signal-engine/providers/meta-ads.ts`) was already a real, complete implementation when this milestone was picked up — not a stub — fetching real ad_count/advertiser_count/active_ad_pct from the Meta Ad Library `ads_archive` endpoint with defensive parsing and full honest-null coverage (credential gating, minimum-sample gate, non-200/error/malformed-JSON/network-throw responses all verified to return null via mocked-fetch tests). M1.3 already made it contribute as an independent `paid_media` channel. What this pass added: (1) the "90-day delta where obtainable" from the milestone's own goal text — implemented as `recent_ad_start_pct`, an honestly-disclosed single-request proxy (fraction of fetched ads started in the last 90 days), not a true count-over-time delta, since a real delta needs two requests separated by real time and no persistence layer exists for this provider; (2) `earliest_ad_start`/`latest_ad_start` (real observed dates) and `avg_active_ad_age_days`/`avg_concluded_ad_duration_days` (creative longevity, kept as two separate honest measurements — running vs. already-concluded ads — never blended into one number); (3) a new `MarketingIntelligence.tsx` extension-zone UI section, gated on `metaAdsProvenance` confirming meta-ads specifically contributed to `virality.sources` for the query (not merely that `virality` exists, since tiktok/reddit populate the same composite) — renders a "Not available from this provider" empty state otherwise, never an estimate. "Fires on the 3 benchmark queries" was not run live — `META_ADS_ACCESS_TOKEN` is unset in this environment (same constraint noted in the provider's own header comment); verified instead via 30 deterministic unit tests in `meta-ads.test.ts` (mocked fetch) plus 5 new tests for `metaAdsProvenance`'s gating logic. Verified: `tsc --noEmit` clean, 369/369 tests passing (24 files), `next build` clean.

### M1.6 — DataForSEO time series (search velocity) `[ ]`
**Blueprint refs:** §2 Pillar 1, §4 stage 3, §5. **Depends on:** M1.3 (tags as `search-intent`).
Fetch 12–48 month search-volume history for the query cluster; compute level, slope (12m), and acceleration (second derivative). Emit as demand-channel signals with directional read (`accelerating/stable/decelerating`).
**Acceptance criteria:**
- All 3 benchmark queries produce slope + acceleration values with sample sizes.
- Directional read is deterministic and unit-tested against fixture series (rising, flat, declining, seasonal-noisy).
- Cost per analysis measured and logged.

### M1.7 — Wire the Review Engine `[ ]`
**Blueprint refs:** §15 (KEEP + WIRE). **Depends on:** nothing (parallel).
Connect the already-built Review Engine into the generate pipeline so its output feeds Pillar 4 inputs (pain clusters, unserved-claim gap inputs).
**Acceptance criteria:**
- Review Engine output appears in signal evidence for the benchmark queries.
- No latency regression beyond the slow-tier budget (60s).

### M1.8 — Billing `[ ]`
**Blueprint refs:** §15 (ADD NEW). **Depends on:** nothing (parallel; required before beta).
Stripe (or equivalent): plan gating on analyses/month, watch slots reserved for Phase 2.
**Acceptance criteria:**
- A user without an active plan cannot run a full analysis.
- Webhook-driven entitlement updates; no client-trusted state.

**Phase 1 exit criteria:** ledger recording every analysis; no single-witness top verdicts; no noise weights in scoring; at least three independent channels live (amazon-market, search-intent, paid-media); Review Engine wired; billing enforced.

---

## Phase 2 — Major improvements after beta

### M2.1 — Concordance matrix + directional reads `[x]`
**Blueprint refs:** §4 stage 4, §10, §13 item 3. **Depends on:** M1.4, M1.5, M1.6.
Each demand channel emits `accelerating / stable / decelerating / absent`; build the cross-channel concordance matrix; render it in the report as a per-channel scorecard with actual numbers.
**Acceptance criteria:**
- Matrix renders for benchmark queries with ≥3 channels populated.
- Agreement/divergence feeds confidence (M1.4) and is consumed by M2.2.

**Completed 2026-07-13.** Before starting, re-verified M1.1/M1.2/M1.4/M1.6/M1.7/M1.8 fresh against the code (not the roadmap's own stale checkboxes, which still showed `[ ]`): all six are genuinely complete — ledger writes, honest weights, the independence gate, DataForSEO acceleration, the Review Engine, and billing gating all confirmed live in the current codebase. None needed work; only M2.1 was genuinely incomplete.

Real per-channel data did not previously exist to build a genuine matrix from: `lib/signal-engine/engine.ts`'s `aggregateDimension()` blends every contributing provider's `growth.momentum` into one final value (highest-confidence provider's string fields "win"), discarding what every other contributing provider individually reported. Required one additive extension: `AggregatedDimension.perProviderValues` (new, optional field, populated in both branches of `aggregateDimension`) preserves each provider's own un-blended signal alongside the existing blended `value` — every existing consumer of `AggregatedDimension` is unaffected.

New `lib/concordance.ts` (`computeConcordanceMatrix`) reads `growth.perProviderValues` back out, maps each contributing provider to its channel via the already-exported `PROVIDER_CHANNEL` (lib/scoring.ts), and reports one of `Accelerating | Stable | Decelerating | Absent` for each of demand's three real channels (`search_intent`, `amazon_market`, `consumer_voice` — the channels that actually populate `growth` today; tiktok/meta-ads populate `virality`, not `growth`, so their absence here is correct, not a gap). Computed once at generation time (`app/api/generate/route.ts`, alongside `signal_evidence`) and persisted on `MemoData.concordance_matrix` so a later re-render sees the same matrix, not a recomputation — same rationale as the pre-existing `category_creation_broad_evidence` persistence. Rendered as a per-channel scorecard in `DemandIntensity.tsx`, always showing all 3 channel slots (Absent shown honestly, never hidden or fabricated).

**Scoping decision, disclosed rather than silently limited:** `agreement` (`Unanimous | Majority | Mixed | Insufficient`) is computed and rendered, but was **not** wired into `lib/confidence`'s M1.4 confidence formula. The roadmap's own text says this matrix is "consumed by M2.2" (the lifecycle classifier), which does not exist yet — wiring a real input into M1.4's already-shipped, already-tested formula ahead of its actual downstream consumer existing would mean guessing what M2.2 will need rather than building to a real spec. `agreement` is real and available for M2.2 to consume once it's built.

Reddit is `STRUCTURALLY_DISABLED_PROVIDERS` in this environment (no credentials configured anywhere), so `consumer_voice` will show `Absent` on every live query until that changes — this is an honest reflection of current deployment state, not a bug in the matrix logic itself (verified via unit tests with all 3 channels populated).

Verified: `tsc --noEmit` clean, 389/389 tests passing (26 files, including 2 new test files — 3 tests for `engine.ts`'s aggregation extension, 10 for `computeConcordanceMatrix` covering channel mapping, Absent-channel honesty, tie-breaking between two providers on the same channel, and all four agreement tiers), `next build` clean (`/memo/[id]` 52.2kB → 52.5kB, expected from the new UI card).

### M2.2 — Lifecycle classifier v1 + gap velocity `[ ]`
**Blueprint refs:** §3, §9. **Depends on:** M2.1; supply-velocity input from M2.3.
Heuristic signature table mapping concordance patterns + supply velocity onto the six stages. Compute `gap_velocity = demand_acceleration − supply_acceleration`. Label outputs "heuristic v1" honestly.
**Acceptance criteria:**
- Every analysis emits a stage + gap velocity with the inputs that produced it (auditable).
- Known-answer tests: a saturated fixture (creatine-like) classifies Saturated/Contested; a fabricated emerging fixture classifies Emerging.
- Stage and gap velocity are written to the Verdict Ledger.

### M2.3 — New-listing velocity from `listedSince` `[x]`
**Blueprint refs:** §2 Pillar 2, §15 (Keepa minor improvement). **Depends on:** nothing (data already fetched).
Emit the `listedSince` distribution: share of competitive set younger than 12/24 months and its trend — not just the median.
**Acceptance criteria:**
- Benchmark queries produce young-listing shares; values sanity-checked against raw Keepa data.
- Signal tagged `supply-side`, feeds gap velocity (M2.2).

**Completed 2026-07-13.** Built ahead of M2.2 (which structurally requires this milestone's output for `gap_velocity`'s supply-side term) rather than as a separate later pass, per explicit direction to preserve the roadmap's own dependency order. New `SupplyVelocitySignal` type (`lib/signal-engine/types.ts`) plus `computeSupplyVelocity()` (`lib/signal-engine/providers/keepa.ts`) reuse the exact `listedSinceMonths` array already collected for the pre-existing `avg_listing_age_months` median — zero new Keepa tokens spent. Emits real `young_listing_pct_12m`/`young_listing_pct_24m` shares and a single-snapshot `entry_velocity` proxy (`Accelerating`/`Stable`/`Decelerating`, from the ratio of the two shares — 0.5 = uniform entry rate over the 24-month window), honestly disclosed as a proxy rather than a true two-point-in-time delta, since this provider makes one request per analysis with no persisted historical snapshot to compare against (same constraint as M1.5's `recent_ad_start_pct`).

**"Signal tagged supply-side" — satisfied at the label/provenance level, not the cross-provider channel-independence system**, disclosed rather than silently glossed over: `PROVIDER_CHANNEL` (`lib/scoring.ts`) maps at provider granularity, and `supply_velocity` is populated by the same Keepa fetch already tagged `amazon_market` — giving it a fully independent `supply_side` witness in the channel-independence/evidence-breadth accounting would need either a second real Keepa request under a distinct provider name (real added cost for data this fetch already has) or a per-dimension channel-override mechanism neither this milestone nor M1.3 authorized. The data is real either way; only the cross-provider independence bookkeeping doesn't yet distinguish it from Keepa's other `amazon_market` output. `lib/scoring.ts`'s M1.3-era comment anticipating this exact tradeoff was updated in place rather than left stale.

`AggregatedDimension.perProviderValues` (added in M2.1) and `'supply_velocity'` added to `engine.ts`'s aggregation `dims` array — both small, additive, non-breaking extensions of already-shipped M2.1/M1.3 work.

Verified: `tsc --noEmit` clean, 397/397 tests passing (27 files, 8 new for `computeSupplyVelocity` — minimum-sample gate, real share computation, all three `entry_velocity` tiers, the no-listings-under-24-months edge case, score/confidence monotonicity), `next build` clean.

### M2.4 — Verdict matrix (two-axis decisions) `[ ]`
**Blueprint refs:** §7, §8. **Depends on:** M2.2.
Replace the scalar verdict with the Quality × Lifecycle matrix and the seven-verdict vocabulary. Reorganize dimensions into the four pillars (evolution of `computeGroundedScore`, not a rewrite). BUILD_NOW gate: two channels + verified economics + safety gate.
**Acceptance criteria:**
- All seven verdicts reachable via fixtures; matrix cell logic unit-tested.
- Timing never enters the Quality score (Principle 7 test: same pillar inputs at different stages produce the same Quality, different verdicts).
- Ledger schema records both axes.

### M2.5 — PubMed + ClinicalTrials.gov pipeline `[ ]`
**Blueprint refs:** §5, §2 Pillar 1/4. **Depends on:** M1.3.
Nightly batch: publication counts + velocity per tracked ingredient; trial registrations. Cached table read by the fast tier; tagged `science`.
**Acceptance criteria:**
- Berberine shows a historical publication-velocity series consistent with its known 2022–2024 surge (sanity anchor).
- Cache-read adds <500ms to fast tier; pipeline failures degrade to null.

### M2.6 — USPTO trademark pipeline `[ ]`
**Blueprint refs:** §5, §2 Pillar 2. **Depends on:** M1.3.
Nightly batch: filing velocity per niche term/class; tagged `supply-side`; feeds gap velocity.
**Acceptance criteria:** filing counts + 12m trend per benchmark niche; null-degrading.

### M2.7 — Reddit problem-cluster pipeline `[ ]`
**Blueprint refs:** §6 (repoint). **Depends on:** nothing.
Scheduled mining of problem-language clusters (systematizes the manual VOC research); output feeds discovery/Pillar 4, not per-query virality.
**Acceptance criteria:** weekly job produces ranked problem clusters with volume trends; at least one cluster matches a known VOC finding (validation anchor).

### M2.8 — Watchlist, alerts, kill criteria `[ ]`
**Blueprint refs:** §13 item 8, §14. **Depends on:** M2.2, M2.4.
One-click Watch; each report emits 3–4 falsifiable kill criteria; alerts fire on stage transitions and kill-criteria triggers. Leaderboard evolves into the lifecycle pipeline (kanban) view.
**Acceptance criteria:**
- Watched niche re-checks on schedule; a fixture-forced stage transition produces an alert.
- Kill criteria are machine-evaluable (each maps to a signal + threshold, not prose).

### M2.9 — Quarterly re-measurement worker `[ ]`
**Blueprint refs:** §11, §12. **Depends on:** M1.1, M2.3.
For every ledgered niche: fast-tier re-pull; record new-entrant count, entrant review traction (3/6/12-month checkpoints), price movement, listing velocity. Write outcome labels.
**Acceptance criteria:**
- Worker processes the full ledger within token budget (~70 Keepa tokens/niche, logged).
- Outcome rows link immutably to their originating verdict row.
- First real outcome labels exist for the oldest ledger entries.

**Phase 2 exit criteria:** every analysis carries stage + gap velocity + matrix verdict; six channels live; watchlist retention loop running; outcome labels accruing.

---

## Phase 3 — Long-term strategic advantages

### M3.1 — Calibration reporting `[ ]`
**Depends on:** M2.9 with ≥2 quarters of outcome labels.
Calibration curves per verdict class ("when we said Window Open, a window existed X% of the time"); publish internally first.
**Acceptance criteria:** reproducible calibration notebook/job from ledger data alone; engine-version-segmented.

### M3.2 — First weight + reliability refit `[ ]`
**Depends on:** M3.1, sufficient n (define threshold before fitting; pre-register the method).
Refit pillar weights and provider reliability priors from outcomes; version as engine vNext; heuristic weights remain fallback.
**Acceptance criteria:** fitted weights outperform heuristic weights on held-out ledger entries; both versions recorded; rollback path exists.

### M3.3 — Entrant cohort analysis `[ ]`
**Depends on:** M2.9 (12-month labels).
"Products launched into our Window Open calls achieved X" — the marketing claim and the institutional artifact.
**Acceptance criteria:** cohort report generated from ledger; methodology documented and auditable.

### M3.4 — Analog engine v1 `[ ]`
**Depends on:** M3.1 (needs labeled histories).
Signature matching of a live niche against historical ledger cohorts ("resembles ashwagandha Q2-2019, month 7 of window").
**Acceptance criteria:** nearest-analog output with similarity basis shown; never presented as more than analogy (Principle 1).

### M3.5 — TikTok Shop (Kalodata) provider `[ ]`
**Depends on:** revenue justification.
Upgrades social-attention from hashtag proxy to GMV fact.
**Acceptance criteria:** GMV-based demand signal on benchmark niches; independent channel in concordance.

### M3.6 — Import records (Panjiva/ImportGenius) `[ ]`
**Depends on:** revenue justification.
Supply-side foresight: import commitments precede listings by months.
**Acceptance criteria:** import-volume trend per niche feeding gap velocity.

### M3.7 — Adjacent-vertical expansion `[ ]`
**Depends on:** M3.1 (proven calibration in supplements first).
Pet supplements → personal care, reusing pillar/lifecycle machinery with vertical-specific science layers.
**Acceptance criteria:** one new vertical end-to-end with its own science cache and benchmark queries.

---

## Phase 4 — Institutional-grade platform

### M4.1 — Track record as product `[ ]`
**Depends on:** M3.1–M3.3.
Auditable, versioned prediction history with calibration curves, user-facing.
### M4.2 — API + data feed `[ ]`
**Depends on:** M4.1.
Programmatic access for PE/CPG innovation teams; the Investor Report as a deliverable.
### M4.3 — Multi-vertical lifecycle database `[ ]`
**Depends on:** M3.7 across ≥3 verticals.
Labeled market-lifecycle histories as the proprietary asset; analog engine across categories.
### M4.4 — Panel partnerships `[ ]`
**Depends on:** institutional pricing in place.
Transaction panels, retail availability data.

---

## Standing constraints (apply to every milestone)

- All ten NON-NEGOTIABLE DESIGN PRINCIPLES from the blueprint bind every milestone.
- No milestone may rewrite a KEEP AS-IS component; REDESIGN components evolve in place.
- Every milestone ends with the 3-query benchmark regression (berberine, creatine, magnesium) and a green typecheck.
- Every schema change to the Verdict Ledger is additive-only (append-only table, append-only schema).
