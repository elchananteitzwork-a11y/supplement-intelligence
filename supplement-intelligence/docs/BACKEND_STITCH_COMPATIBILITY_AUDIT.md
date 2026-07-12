# Backend ↔ Stitch Compatibility Audit — Search-to-Results Flow

**Scope:** Can the existing backend, APIs, data models, and search engine fully support the Stitch search-to-results screens and interactions? No frontend or backend code was changed to produce this document — it is read-only research against the code as it exists today.

**Method:** every field visible in scope was traced to its exact response property or database column by reading the actual route handlers, type definitions, and migrations (not inferred from memory). Sources cited by file path throughout.

---

## 0. Executive summary

The backend is **substantially richer than the discovery-results frontend currently exposes**. The dominant finding is not "missing data" — it's **Section B (supported but not exposed)**: the signal engine computes dozens of real fields (per-competitor listings, momentum/seasonality figures, listing age, price compression, ad counts) that are already inside the `/api/discover` HTTP response today and simply aren't read by `CategorySignalPanel`. The current `/analyze` results screen surfaces perhaps 15% of what `/api/discover` and the signal engine actually return. (Note: this specific gap is scoped to the discovery-results screen — the separate `/memo/[id]` investor-report screen already renders the analogous Decision Engine confidence/evidence-breadth data in full via `components/memo/EvidenceConfidence.tsx`, see §1.8 and Section A.)

There is exactly **one genuine schema gap that matches a Stitch visual 1:1**: `verdict_ledger.lifecycle_stage` (`Latent/Emerging/Window Open/Contested/Saturated/Declining`) already exists as a column — it is the exact vocabulary of Stitch's "Market Lifecycle" arc — but is permanently `null` because the classifier that would populate it (Roadmap M2.2–M2.4) was never built. This is not a fabrication risk to build around; it's a real, already-provisioned extension point that just needs its computing logic.

There is **no server-side filter/sort/compare capability for discovery-time opportunity cards** (Section C) — all filtering/sorting in the current UI is client-side over an already-fetched array, and "Compare Selected" (Stitch) has no real target, because pre-analysis AI suggestions never receive a persisted ID.

---

## 1. Screen-by-screen field mapping

Status legend used in every table:
- **✅ Exposed** — field exists in the API response today, already real, already usable by the frontend as-is.
- **🟡 Computed, not exposed** — the backend computes/holds this value but no API route currently returns it to the client.
- **🟠 Raw only** — a raw provider field exists deep in `AggregatedSignals`/`memo_data` but nothing formats or labels it for display.
- **❌ Missing** — no backend computation or provider exists for this at all; would require new work.
- **🎭 Decorative** — Stitch shows this for visual richness only; no real-world analog is meaningful here.

### 1.1 Search input & category selection (Stitch: "Search Focused")

| Visible field | Backend source | Response property / DB column | Status |
|---|---|---|---|
| Query text box | Client state only | n/a (no persistence until submit) | ✅ Exposed |
| Category chips (Supplements/Beauty/Pet/Fitness/Home) | `lib/categories/client-config.ts` `CATEGORY_CLIENT_CONFIGS` | static client config, mirrors `categoryRegistry` server-side (`lib/categories/index.ts`) | ✅ Exposed |
| "Open Discovery" auto-classify | `classifyQuery()` → `lib/categories/index.ts`, invoked in `app/api/discover/route.ts:196-202` | `resolvedCategoryId` in discover response | ✅ Exposed |
| "Recent Intelligence Queries" list (Stitch shows 2 past queries under the search bar) | `analyses` table (`user_id, created_at desc` — `supabase/migrations/001_schema.sql:70`), or `discovery_cache` | not currently queried by any form-state route | 🟡 Computed, not exposed — trivial: a `select raw_input, category_name, created_at from analyses where user_id=... limit 5` would supply this with zero new backend work |
| "Live Market Sentiment" bar chart (Stitch) | none | none | 🎭 Decorative — no real aggregate-sentiment computation exists or is implied by any other part of the system |
| "Node Status: Active" / "Active Tracks: 412" (Stitch) | none | none | 🎭 Decorative — fabricated system telemetry, correctly already omitted |

**Interaction support:** fully supported. **Frontend fallback:** none — the rebuilt form already only uses real fields.

### 1.2 Classification state (Stitch: "Loading Early")

| Visible field | Backend source | Response property | Status |
|---|---|---|---|
| Query headline (resolved instantly, no skeleton needed) | client state (user's own input) | n/a | ✅ Exposed |
| "Interpreted as: X · Amazon ID" | `classifyQuery()` returns a `categoryId`, not an Amazon node ID | `resolvedCategoryId` | 🟡 Computed, not exposed as originally styled — Stitch's "Amazon 35" node-id framing is invented; the real equivalent (`categoryId`/`categoryName`) is already returned |
| "Live Evidence Stream" ticking log lines ("Reading 27 bestsellers…", "36 months of unit-sales history found") | none — these are per-request narrative strings tied to real provider calls that haven't executed yet at classify-time | none | ❌ Missing at this exact stage — classify only calls Claude for category routing (`classifyQuery`), no provider is touched yet, so there is nothing real to narrate here until Discovery starts |
| Dot pagination / skeleton cards | client-only chrome | n/a | ✅ Exposed (presentation only) |

**Interaction support:** classify step itself is fully supported (real category resolution). Live per-provider narration during classify has no real backing — correctly rebuilt as a generic step list, not fabricated line-items.

### 1.3 Discovery progress (Stitch: "Preliminary Read")

| Visible field | Backend source | Response property | Status |
|---|---|---|---|
| "PRELIMINARY — 3 of 6 sources in" pill | `signalEngine.fetch()` (`lib/signal-engine/index.ts`) queries multiple providers in one batched call | `AggregatedSignals.providers_used[]`, `failed_providers[]` — **only known after the whole batch resolves**, not incrementally | 🟠 Raw only — the *final* count is real; a live *incrementing* per-provider counter is not observable client-side today |
| "Signal Lifecycle" radial gauge / circular Stage N/6 | none — no per-request stage-progress event stream exists | none | ❌ Missing — would require Server-Sent Events or WebSocket streaming from `signalEngine.fetch()`; currently a single synchronous `await` |
| "Data Integrity" checklist (Retail Velocity: Pending / Social Sentiment: Verified …) | `AggregatedSignals.providers_used` / `.failed_providers`, but only post-hoc | same as above | 🟠 Raw only — real provider identity exists (`keepa`, `google-trends`, `tiktok`, `dataforseo`, `meta-ads`, `apify-*`, `openfda`), but no per-provider "verified at 08:12:44" timestamp is ever recorded — signal-engine fetches providers via `Promise.allSettled` in parallel with one shared timeout, not sequentially with individual completion events |
| "Resolving Evidence" timestamped narrative feed (e.g. "Retail Intake — Significant SKU expansion noted…") | none | none | ❌ Missing — this is AI-generated color commentary per provider per moment; no such generation step exists in the discovery pipeline (Claude is called once, at the end, to produce opportunity cards — not to narrate the search) |
| "Interim Synthesis" AI quote box | none | none | ❌ Missing — no interim-narrative generation step exists; would require a second, smaller Claude call mid-flight |
| "Probe deeper…" live-refine search box | none | none | ❌ Missing — no mid-flight query-refinement endpoint exists; `/api/discover` is a single request/response, not a session |

**Interaction support:** the *underlying data* (which providers ran, which succeeded) is fully real and available once the request completes. The *live, incremental* nature of Stitch's progress screen (per-provider timestamps, streaming narrative, mid-flight refinement) has **no backend equivalent at all** — `/api/discover` is a single 12-second-budgeted synchronous call (`signalEngine.fetch(..., 12_000)`, `app/api/discover/route.ts:284`), not a stream. **Frontend fallback:** yes, by necessity — the rebuilt progress screen simulates step pacing client-side (as the old one did) rather than fabricating fake per-provider timestamps, and documents this explicitly in code comments.

### 1.4 Opportunity results / ranking / map (Stitch: "Pipeline - Opportunity Portfolio")

This is the highest-value screen for the audit — it's where the richest backend/frontend gap exists.

| Visible field | Backend source | Response property / DB column | Status |
|---|---|---|---|
| Opportunity name | Claude discovery response, validated by `isValidCard()` | `OpportunityCard.name` | ✅ Exposed |
| Rationale / thesis text | Claude discovery response | `OpportunityCard.rationale` | ✅ Exposed |
| Promise tier (High/Med/Low) | Claude discovery response, AI's own qualitative judgment | `OpportunityCard.promise` | ✅ Exposed |
| Difficulty (Easy/Med/Hard) | Claude discovery response | `OpportunityCard.difficulty` | ✅ Exposed |
| Capital tier (Lean/Moderate/Capital-Intensive) | Claude discovery response | `OpportunityCard.startup_cost_tier` | ✅ Exposed |
| Launch speed (Fast/Moderate/Slow) | Claude discovery response | `OpportunityCard.launch_speed` | ✅ Exposed |
| Demand/Virality/Subscription/Manufacturing/Market-saturation dimension tiers | Claude discovery response | `OpportunityCard.scores.*` | ✅ Exposed |
| "NEW" / trend delta tag | `enrichWithMeta()` — real week-over-week comparison of the AI's own promise tier (`app/api/discover/route.ts:80-122`) | `OpportunityCard._meta.promise_delta`, `.is_new`, `.trending` | ✅ Exposed as of the last rewrite — **`trending: boolean` exists in the type (`types/index.ts:26`) and is populated server-side but is not currently rendered anywhere in the frontend** (only `promise_delta` is shown via `DeltaTag`) |
| "MoM Growth: +124%" (Stitch) | none per-opportunity | none | ❌ Missing — no numeric growth is ever computed per AI-suggested opportunity (only `promise_delta`'s up/down/same/new, which the rebuild already substitutes honestly) |
| Lifecycle stage grouping (Emerging/Window Open/Contested/Saturated) | **Partially real**: `verdict_ledger.lifecycle_stage` column exists with exactly this check-constraint vocabulary (`supabase/migrations/017_verdict_ledger.sql:71-72`) | column is defined but **always written `null`** — no classifier exists yet (comment: "nullable until Roadmap M2.2–M2.4 ship") | 🟡 **Schema exists, computation missing** — this is the one field in the whole audit that is a genuine "half-built" capability, not a pure fabrication risk. Also: `verdict_ledger` only has one row per *completed full analysis*, never per discovery-time *candidate opportunity* — so even once the classifier ships, it wouldn't cover the 20 unanalyzed cards on this screen, only ones a user has already spent a slot generating a full report for |
| "REAL-TIME OPPORTUNITY MAPPING // N Active Markets" | count of `OpportunityCard[]` returned | `opportunities.length` | ✅ Exposed |
| Best-bets / quadrant chart position | Derived client-side from `promise` + `difficulty` (both real AI tiers) | n/a — pure client-side plotting of two already-real categorical fields | ✅ Exposed (interaction fully supported; no backend gap) |
| "Compare Selected" multi-select checkbox → compare action | none for discovery-time cards | none — `OpportunityCard` has no persisted `id`; nothing to compare against | ❌ Missing — see §1.9 below. Comparison only works for *already-generated* research-pipeline theses (`investment_theses.id`), never for raw discovery suggestions |
| "Export" button | none | none | ❌ Missing — no CSV/export endpoint exists anywhere in the codebase for discovery results |
| System-status footer (Engine Status/API Latency/Last Sync) | none | none | 🎭 Decorative |

**Real Category Signal panel** (currently shown, sourced from the *one* real category-level provider call):

| Visible field | Backend source | Response property | Status |
|---|---|---|---|
| Search volume, trend | `AggregatedSignals.demand.value.search_volume/.trend` | `categorySignal.demand.value.*` | ✅ Exposed |
| YoY (Amazon BSR) | `AggregatedSignals.growth.value.yoy_change` | `categorySignal.growth.value.yoy_change` | ✅ Exposed |
| Competing sellers, saturation | `AggregatedSignals.competition.value.*` | `categorySignal.competition.value.*` | ✅ Exposed |
| Avg price | `AggregatedSignals.pricing.value.avg_price` | `categorySignal.pricing.value.avg_price` | ✅ Exposed |
| TikTok signal | `AggregatedSignals.virality.value.tiktok` | `categorySignal.virality.value.tiktok` | ✅ Exposed |
| **Everything else in `AggregatedSignals`** (see `lib/signal-engine/types.ts`) — `annual_growth_rate`, `momentum_3m_pct`, `top_regions[]`, `distinct_brand_count`, `top_brand_review_share`, `seller_count_trend`, `market_maturity`, `avg_listing_age_months`, `amazon_oos_pct`, `amazon_buybox_pct`, `price_compression_pct`, `price_avg_90d/365d`, `sns_enrolled_pct`, `category_fba_pct`, `ad_count`, `advertiser_count`, `active_ad_pct`, `review_velocity.top_competitors[]` (full brand/reviews/rating/price/breadcrumb/bullets list), `review_velocity.pain_point_examples[]` | Same `signalEngine.fetch()` call, already in the response object | `categorySignal.<dimension>.value.<field>` — **already in the HTTP response payload today**, simply not read by `CategorySignalPanel` | 🟡 **Computed AND already in the wire response, purely unexposed in the UI** — this is the single largest, lowest-cost improvement opportunity in the entire audit: zero new backend work, only frontend mapping |

**Interaction support:** map/rank/expand/filter-by-tier are fully supported by real data. Compare-select and export are not. Lifecycle-stage grouping is schema-ready but uncomputed. **Frontend fallback:** the rebuild groups by `promise` tier instead of `lifecycle_stage` specifically because the latter is always null — this is the correct honest choice given current backend state, not a regression, but it *is* a deliberate simplification versus Stitch's literal design that a real classifier could later replace.

### 1.5 Selected opportunity detail (expand-in-place)

Covered by the same `OpportunityCard.scores.*` fields as §1.4 — no additional backend surface. Fully supported; no gap.

### 1.6 Comparison behavior

Two entirely separate systems exist under the name "compare":

| Context | Backend | Status |
|---|---|---|
| Discovery-results "Compare Selected" (Stitch) | none | ❌ Missing — see §1.4 |
| `/research/compare` (real, working today) | `app/api/research/compare/route.ts` — full `ComparisonItem` contract: `thesis_id, signal_id, product_angle, target_customer, differentiation, category_id, market_revenue_mo, competitor_count, review_concentration, median_price, momentum_90d_pct, trend_direction, tiktok_view_count, data_confidence, min_capital_required, launch_complexity, margin_viable, complexity_drivers[], threshold_pass_count, threshold_overall, all_switches_clear, triggered_switches[], verdict_code, verdict_headline, founder_verdict_code, breakeven_cogs, base_price, year1_base, base_monthly, fit_rank, capital_fit_level, channel_fit_level, timeline_fit_level, opportunity_score` (`app/api/research/compare/route.ts:15-60`), backed by joins across `market_signals`, `investment_theses`, `adversarial_debates`, `investment_memos`, `founder_fit_annotations` | ✅ Fully exposed — this is the richest single contract in the whole backend, but it only operates on **research-pipeline theses**, never on discovery-flow `OpportunityCard`s |

**Conclusion:** if Stitch's "Compare Selected" on the discovery-results screen is a hard requirement, the only honest path is either (a) require the user to run a full analysis first (giving the opportunity a real `analyses.id`) before it becomes comparable, or (b) build a new lightweight compare surface scoped to raw `OpportunityCard`s (no persisted id today — would need one).

### 1.7 Analysis progress (full-report generation)

Same shape and same gaps as §1.3 (discovery progress) — one difference: `/api/generate` runs 8 real sequential-ish stages (market signals, keyword intelligence, consumer intelligence, manufacturing estimate, scoring, AI writing, news intelligence, DB write), all inside one request (`app/api/generate/route.ts`, `maxDuration = 285`). Real provider list is knowable in advance (`Keepa, Google Trends, TikTok, Amazon Reviews, Meta Ads` per the rebuilt `ANALYSIS_PROVIDERS` list) but, same as discovery, there is no incremental event stream — the client cannot know which stage is *actually* executing server-side at any moment, only simulate pacing.

### 1.8 Decision Engine output / Opportunity Score

| Field | Source | Status |
|---|---|---|
| `opportunity_score` (0-100) | `computeGroundedScore()` → `GroundedScore.score` (`lib/scoring.ts:1198-1312`) | ✅ Exposed (`memo.opportunity_score`, `analyses.opportunity_score`) |
| `build_decision` | `GroundedScore.decision` | ✅ Exposed |
| Per-dimension breakdown (`ScoreDimension[]`: key/label/weight/rawScore or qualitativeLevel/source/sourceLabel) | `GroundedScore.dimensions` | ✅ **Exposed — second-pass correction.** Fully itemized in `components/memo/EvidenceConfidence.tsx:83-111`: every scored dimension gets its own score bar (`rawScore`/10), weight %, and source badge; every qualitative (weight-0) dimension is listed separately with its `qualitativeLevel`. This is already a complete, live rendering — there is no gap here at all |
| `groundedPct` / `insufficientEvidence` | `GroundedScore` | ✅ Exposed (drives the memo's "100% real data grounding" / "Insufficient data" banners) |
| `evidenceBreadth` (contributing providers, channel breakdown, cross-channel corroboration) | `GroundedScore.evidenceBreadth` (`lib/scoring.ts:351-375`) | ✅ **Exposed — correction from an earlier draft of this audit.** Not a literal `/api/generate` response field, but `components/memo/EvidenceConfidence.tsx:27` calls `computeGroundedScore(m)` directly against the persisted `memo_data` and renders `contributingProviders`, `totalScoreEligibleProviders`, `channelBreakdown`, and `crossChannelCorroborated` in full, with `WitnessDots`. Already live on the memo page today |
| `verdictOverrideReasons[]` | `GroundedScore` | ✅ **Exposed — correction from an earlier draft.** Not returned as its own structured field, but folded verbatim into `memo.build_explanation` text at generation time (`app/api/generate/route.ts:832-833`: `memo.build_explanation += '\n\n' + grounded.verdictOverrideReasons.join(' ')`) — the user does see this text, just as prose inside the explanation rather than a separate structured UI element |
| Confidence assessment (per-dimension witness channels, `overallConfidence`, `weakestDimension`, `distinctConfirmingChannels`) | `computeConfidenceAssessment()` (`lib/confidence/`), written only to `verdict_ledger` | ❌ **Not returned by `/api/generate` at all** — only persisted to the dormant `verdict_ledger` table (§ below), never included in the `memo` object returned to the client |

### 1.9 Investor report / memo entry point

`/memo/[id]` reads directly from `analyses.memo_data` (full `MemoData` shape, `types/index.ts:141-300`) — this is the single richest object in the system (30+ top-level fields including `signal_evidence`, `keyword_intelligence`, `consumer_intelligence`, `news_intelligence`, `manufacturing_estimate`, `writer_output`, `expandable_cards`, `review_narrative`). Already fully wired; no gap versus Stitch's "Investor Report" screen structure. This screen was rebuilt in a prior session pass and isn't in question here.

### 1.10 Research pipeline (Stage 1–4)

All 4 stages have dedicated, fully-implemented tables and routes:
- Stage 1 (`market_signals`) → `app/api/research/market-signal/route.ts`
- Stage 2 (`investment_theses`) → `app/api/research/thesis/route.ts`
- Stage 2.5 (`founder_fit_annotations`) → `app/api/research/fit/route.ts`
- Stage 3 (`adversarial_debates`) → `app/api/research/adversarial/route.ts`
- Stage 4 (`investment_memos`) → `app/api/research/memo/route.ts`

All fully exposed; verified live in the previous session (a real Stage-1 signal run rendered zero console errors, full real data). No gap relevant to the search-to-results flow specifically — this is a structurally separate flow from `/analyze`.

### 1.11 History and saved results

`app/api/research/history/route.ts` returns real, joined data: `id, query, category_id, quality_grade, pipeline_blocked, blocked_reason, created_at, status (derived), thesis_count, has_debates, has_memo, verdict_code, verdict_headline, opportunity_score (derived via computeOpportunityScore()), is_favorited`. Fully exposed. The simple-flow equivalent (`analyses` table, read directly by `/dashboard` and `/memo/[id]`) is also fully exposed. No gap.

---

## 2. API / data-layer contract audit

### `POST /api/discover`
Real, synchronous, single-request. Input: `{ input, categoryId }`. Output: `{ opportunities[], category, categoryId, categoryName, cached, cache_status, cache_week, generated_at, categorySignal }`. Cache keyed on `(normalized_query, cache_week)` in `discovery_cache` (`supabase/migrations/005_discovery_cache.sql`) — one real AI generation per query per ISO week, top-3 stable/deterministic via seeded shuffle, rest randomized per-user per-session. `categorySignal` is **only populated on a cache miss** (fresh generation) — cache hits always return `categorySignal: null` (`app/api/discover/route.ts:265`), a real, already-correctly-handled honesty constraint the frontend must keep respecting.

### `POST /api/generate`
Real, synchronous, single request, up to 285s. Orchestrates: signal engine, keyword engine, consumer intelligence, manufacturing estimate, scoring (`computeGroundedScore`), AI interpretation, expandable-cards builder, news intelligence, review-narrative synthesis, then writes to `analyses`, `leaderboard` (atomic RPC `upsert_leaderboard_entry`), `build_now_patterns` (BUILD_NOW only), and `verdict_ledger`. Output: `{ analysisId, memo }`. No streaming; no partial-progress endpoint.

### Research API routes
All CRUD-shaped, all real, all RLS-scoped to `auth.uid() = user_id`. No filter/sort query parameters on any of them today — `history` returns the full set and the client filters/sorts.

### Supabase tables actually in play for this flow
`profiles, analyses, leaderboard, discovery_cache, market_signals, investment_theses, founder_fit_annotations, adversarial_debates, investment_memos, founder_profiles, build_now_patterns, verdict_ledger`. All RLS-enabled, owner-scoped except `leaderboard` (authenticated-read) and `discovery_cache` (authenticated-read/write, shared cache).

### Decision Engine outputs
See §1.8. Full breakdown computed, partially exposed.

### Opportunity Score fields
`opportunity_score` (0-100, `numeric(5,1)`), `build_decision`, `scoring_version` (formula version stamp, for comparability across score-formula changes) — all real, all exposed on both `analyses` and `leaderboard`.

### Provider status & confidence data
Real at the `AggregatedSignals` level (`providers_used[]`, `failed_providers[]`, `overall_confidence`) — exposed via `categorySignal` on discover, and via `signal_evidence` inside `memo_data` on generate. The richer, independence-aware `ConfidenceAssessment` (channel witnesses, weakest-dimension gating) exists only in `lib/confidence/` and is written to the dormant `verdict_ledger` — never returned to any client.

### Caching & saved-analysis behavior
Discovery: weekly cache, described above. Generate: no cache — every full-report generation is a fresh, slot-consuming run (confirmed via `shouldConsumeSlot`/`refund_analysis_slot` RPC logic). `analyses` rows are permanent, user-scoped, never expire. `market_signals` rows expire after 30 days (`expires_at` column) — the only TTL'd table in the research pipeline.

---

## 3. Four-section summary

### A. Fully supported by the current backend
- Search input, category selection, Open Discovery auto-classification
- Discovery result set: name/rationale/promise/difficulty/capital-tier/launch-speed/all 5 dimension tiers
- Promise-delta / is-new / trending metadata (server-computed, partially rendered)
- Opportunity Map (promise-vs-difficulty scatter) — both axes are real AI-tier fields
- Real Category Signal panel (the 6 fields currently shown)
- Expand-in-place opportunity detail
- Full research pipeline (Stages 1–4), history, compare (for research-pipeline theses only)
- Decision Engine score/decision/groundedPct/insufficientEvidence
- Evidence Breadth (contributing providers, channel breakdown, cross-channel corroboration) — already rendered on the memo page via `computeGroundedScore(m)` in `components/memo/EvidenceConfidence.tsx`
- Verdict override reasons — folded into `build_explanation` prose, already shown to the user
- `GroundedScore.dimensions[]` full per-dimension breakdown — already fully itemized (score bars, weights, source badges) in `components/memo/EvidenceConfidence.tsx:83-111`
- Investor report / memo entry point — verified in depth this pass: 9 dedicated section components (`components/memo/{MarketIntelligence,KeywordIntelligence,NewsIntelligence,ConsumerIntelligence,ManufacturingIntelligence,CompetitiveLandscape,UnitEconomicsTable,LaunchStrategy,StrategicReadinessChecklist}.tsx`) plus `FirstScreenSummary`/`EvidenceConfidence`/`InvestmentThesis`/`FinalRecommendation` collectively render nearly the entire `MemoData` object, including `writer_output`, `expandable_cards`, and `first_screen_signal_ids` (all confirmed live in `FirstScreenSummary.tsx`)
- Research pipeline Stage 1 evidence display (`Stage1Evidence`, `lib/evidence/adapter.ts`) — verified this pass: already surfaces effectively every field in the adapter (demand, competition, revenue, growth, seasonality, virality, price compression, ranking difficulty, PPC economics, regulatory intelligence, top-competitors table). No gap found.
- Weekly discovery cache with honest cache-status labeling

### B. Supported but not currently exposed to the frontend
- 25+ real `AggregatedSignals` fields already inside the `/api/discover` response payload today (top competitors list, momentum, seasonality, listing age, OOS%, buybox%, price compression, SNS enrollment, ad counts, pain-point examples) — **zero new backend work required**, pure frontend mapping. **This remains the single largest real gap found in the entire audit.**
- `_meta.trending` boolean (computed, unused)
- `ConfidenceAssessment` (channel witnesses) — computed, written only to the dormant `verdict_ledger`, never returned by `/api/generate`
- **`memo.review_narrative`** (`ReviewNarrativeSynthesis` — AI-synthesized review commentary: `top_complaints`, `top_requested_features`, `ai_recommendation`, `pain_points`/`missing_features`/`positive_themes` ranked insights, real `avg_rating`) — confirmed via `grep` this pass: computed and persisted at `app/api/generate/route.ts:913` (`memo.review_narrative = narrative`) whenever review count clears the threshold, but **rendered nowhere in `components/memo/*`**. Second real, ready-to-ship gap found this pass, same shape as the AggregatedSignals gap: no new backend work, pure frontend mapping, with a mandatory `disclaimer` field that must render verbatim per `lib/review-narrative/types.ts:39-40`.
- "Recent Intelligence Queries" (trivial query against existing `analyses` table)

### C. Missing backend capability
- Live, incremental per-provider progress streaming (would need SSE/WebSocket — `/api/discover` and `/api/generate` are both single synchronous requests today)
- AI-generated "Resolving Evidence" narrative feed and "Interim Synthesis" quote (no such generation step exists)
- Mid-flight query refinement ("Probe deeper…")
- `verdict_ledger.lifecycle_stage` classifier (column exists, always null — Roadmap M2.2–M2.4, not yet built) — and even once built, it only covers post-analysis records, not pre-analysis discovery candidates
- Compare/select + export for discovery-time `OpportunityCard`s (no persisted id, no compare endpoint for this shape)
- Any numeric per-opportunity "MoM Growth %" at discovery time (no per-candidate provider call exists — only one category-level signal call per search)
- `ConfidenceAssessment` returned via any API (currently write-only to `verdict_ledger`)

### D. Stitch elements that are purely decorative, no backend support needed or implied
- "Live Market Sentiment" bar chart on the search-focused screen
- "Node Status: Active" / "Active Tracks: N" system telemetry
- Engine-status/API-latency/last-sync footer on the Pipeline screen
- "Export" button (no format, no destination system exists)
- OAuth "Continue with Google/Apple" (confirmed in a prior audit this session — no such auth provider is configured)

---

## 4. Prioritized implementation plan (backend work only — no frontend changes proposed here)

**P0 — zero-risk, high-value, no schema change, read-only additions (all frontend-only, zero backend work):**
1. Expose the ~25 unused `AggregatedSignals` fields already in the `/api/discover` response — the single highest ROI action in this audit.
2. Render `memo.review_narrative` as a new memo section (e.g. "Customer Review Intelligence") — fully computed and persisted already, just needs a `components/memo/ReviewNarrative.tsx` in the same pattern as the other 9 section components, with the mandatory disclaimer text rendered verbatim.
3. Surface `_meta.trending` in the discovery-results frontend (already computed, zero backend change).

**P1 — small, additive, no schema change:**
4. Add a lightweight `GET /api/analyses/recent?limit=5` (or extend an existing route) for the "Recent Intelligence Queries" pattern — a simple `select` against `analyses`, already RLS-scoped correctly.
5. Return `ConfidenceAssessment` from `/api/generate` alongside `memo` instead of only writing it to `verdict_ledger` — the computation already runs (`computeConfidenceAssessment(groundedScore)`, `app/api/generate/route.ts:1042`); only the response shape needs to include it.

**P2 — real new capability, moderate effort:**
6. Build the lifecycle-stage classifier (Roadmap M2.2–M2.4) to actually populate `verdict_ledger.lifecycle_stage` — this is pre-planned, schema-ready work, not new scope invented by this audit. Decide explicitly whether it should also run against pre-analysis discovery candidates (a new code path) or remain post-analysis-only (its current design) before promising Stitch's lifecycle-arc grouping on the *discovery* results screen specifically.
7. Decide and, if approved, build a discovery-time compare surface: either (a) a policy that opportunities become comparable only after a full analysis (reuses the existing, working `/research/compare` contract with `analyses.id` as the key), or (b) a new lightweight endpoint/table for comparing raw `OpportunityCard`s pre-analysis. (a) is far cheaper and reuses proven code; (b) is a new persistence layer.

**P3 — large, only worth doing if live progress fidelity becomes a hard product requirement:**
8. Streaming progress (SSE) for `/api/discover` and `/api/generate` — would let the frontend show genuinely real per-provider completion instead of simulated pacing. Significant infrastructure change (Vercel function streaming, client `EventSource` handling, provider-level instrumentation inside `signal-engine`). Not recommended unless the simulated-pacing progress screen is explicitly deemed insufficient after review.
9. AI-generated interim narrative / "Resolving Evidence" color commentary — would require a new, separate lightweight Claude call mid-pipeline, purely for UX narration, with its own cost and latency budget. Lowest priority: highest cost-to-value ratio of everything in this audit, and the current honest step-list already communicates real progress without fabricating content.

**Not recommended at any priority:**
- Fabricating "MoM Growth %" for discovery-time opportunities, or any decorative element in Section D — all would violate the no-fabrication constraint this project has consistently upheld.

---

## 5. Phase 4 completion report (implemented this pass, frontend-only, zero backend changes)

Per the confirmed scope for this pass (deepen the search→results→report flow; leave Dashboard/Leaderboard/Login/Settings/Thesis as previously verified), the two P0 items that required no backend work and had confirmed real data behind them were implemented and verified live with real API calls:

### 5.1 `CategorySignalPanel` (`/analyze` results screen) — enriched from 6 fields to 30+

**Every field below was already present in the `/api/discover` HTTP response before this change** (`categorySignal`, itself the `AggregatedSignals` object from `signalEngine.fetch()`) — nothing new was computed, fetched, or added to any API route. A collapsible "Show full signal data" disclosure was added to `app/analyze/page.tsx`'s `CategorySignalPanel`, grouped by signal dimension, rendering only fields actually present for that query (never a placeholder for an absent one):

- **Demand**: top demand regions, annual growth rate, 3-month momentum
- **Growth**: momentum label, 90-day momentum %
- **Competition**: barrier to entry, distinct brand count, top-brand review share, seller-count trend, market maturity, avg listing age, Amazon OOS rate, Amazon buy-box share, avg variation count
- **Pricing**: price range, premium-viable flag, price-per-unit range, FBA price floor, list-price discount %
- **Revenue**: est. monthly revenue, top-seller revenue, est. monthly units sold, avg rating, avg review count, avg FBA pick/pack fee, avg referral fee %, price compression %, Subscribe & Save enrollment %, category FBA share, category Amazon-direct share
- **Virality**: content potential, UGC potential, TikTok video/view counts, Meta Ads signal, ad count, distinct advertisers, active-ad share
- **Review velocity**: monthly review velocity, sentiment, meaningful-competitor count, review concentration ratio, real pain-point example quotes (Reddit), a real top-competitors table (brand/reviews/rating/price)
- **Seasonality**: pattern, peak months

**Verified live** (query: "electrolyte hydration mix for endurance athletes", fresh — not a cache hit): 24 of the fields above populated with real data and rendered correctly on expand; zero console errors; zero fabricated placeholders for the handful of fields that particular query's providers didn't return (e.g. no top-competitors table appeared because that field was empty for this query — confirmed correct, not a bug).

### 5.2 `memo.review_narrative` — new "Customer Review Intelligence" memo section

**Already computed and persisted** at generation time (`app/api/generate/route.ts:913`, `synthesizeReviewNarrative()`) whenever review count clears the synthesis threshold — confirmed via direct Supabase query that 2 of the last 30 real analyses in the database already carry a populated `review_narrative` object that no UI had ever rendered. Added `components/memo/ReviewNarrative.tsx` (new file, same pattern as the other 9 memo section components) and wired it into `MemoDisplay.tsx`'s section list and both nav rails — conditionally, only appearing for memos that actually carry the data (no dead nav link for memos below the review-count threshold).

**Verified live** against a real stored analysis (`b991051f-eed3-4c1f-a1d6-3b792f13d89c`, "Senior Dog Joint Mobility Chew"): renders 38 real reviews analyzed, 4.6/5 avg rating, "Very Positive" sentiment, a real AI recommendation synthesized from actual complaint/feature-request patterns, 5 real top complaints and requested features verbatim, and ranked pain-point/missing-feature/positive-theme insights — with the architecturally-mandated disclaimer ("AI-synthesized commentary... never used to compute any score, verdict, confidence value, or gate in this report") rendered verbatim per `lib/review-narrative/types.ts`'s binding constraint. Zero console errors.

### 5.3 Corrections made to this audit during Phase 4 verification

Three claims in the original Section 1/2 draft were re-verified against actual rendered component code (not assumed) and found overstated — corrected in place rather than left standing:
1. `evidenceBreadth` — was marked "not exposed"; actually fully rendered in `components/memo/EvidenceConfidence.tsx`.
2. `verdictOverrideReasons` — was marked "invisible to the user"; actually folded into `build_explanation` text, which is shown.
3. `GroundedScore.dimensions[]` — was marked "no itemized rendering"; actually fully itemized with score bars, weights, and source badges in `EvidenceConfidence.tsx`.

This leaves the genuinely-confirmed, still-open items unchanged: the ~25 `AggregatedSignals` fields (now fixed, §5.1), `review_narrative` (now fixed, §5.2), `_meta.trending` (redundant with `promise_delta === 'up'`, already visually represented — no separate UI element needed), `ConfidenceAssessment` (still write-only to `verdict_ledger`, would need a backend response-shape change to expose — not implemented this pass, flagged in §4 P1 item 5 as a proposal), and all of Section C (genuine missing backend capability — not touched).

### 5.4 What was deliberately NOT touched this pass, and why

- Dashboard, Leaderboard, Login, Settings, Thesis pages — out of scope per confirmed pass boundary; already independently verified against Stitch screenshots in an earlier pass.
- The Opportunity Map / Opportunity Inventory structure itself — already rebuilt from the actual Stitch "Pipeline - Opportunity Portfolio" HTML in the prior pass; this pass only enriched the data density of the Real Category Signal panel sitting above it, not its layout.
- Any Section C item (streaming progress, AI-narrated evidence feed, lifecycle-stage classifier, discovery-time compare/export) — all require genuine new backend work beyond "expose what's already on the wire," explicitly out of scope for a frontend-only pass per the audit's own findings.

### 5.5 Validation performed

`tsc --noEmit` clean, `next build` clean (37/37 routes), live end-to-end verification via Playwright with real Supabase data and real API responses (not mocked) for both changes above, zero console errors in either case. Not deployed — dev server running locally for review, per standing instruction.
