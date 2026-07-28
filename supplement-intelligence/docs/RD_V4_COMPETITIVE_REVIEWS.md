# R&D: Surface the Competitive Review Engine (item ג of the core-economics plan)

The deepest built-but-dark subsystem: per-competitor review interrogation
("why do buyers 1-star the leader") — fully implemented, API-wired,
reachable from zero V4 screens. This document scopes the smallest correct
way to put it in front of the user, with real cost controls, because unlike
items א/ב this feature spends real money per click.

## 1. Reuse audit

- **The entire analysis pipeline exists and is orchestrated.**
  `lib/competitive-review-engine/engine.ts` (Keepa/ASIN resolution →
  parallel review collection → per-ASIN `ReviewEngine` → cross-ASIN
  aggregation → market scoring → AI synthesis → `MarketReport`), with
  tuned per-product config and `DEFAULT_OPTIONS` (`engine.ts:25-32`).
  Output types (`types.ts`): `MarketGap` (category/prevalence/severity),
  `WinnerFeature`, `ProductInsight` (top_complaints,
  top_requested_features, sentiment, per-product scores).
- **A hardened HTTP surface exists.** `app/api/reviews/competitive/route.ts`:
  auth (`route.ts:126-127`), rate limit (`REVIEWS_COMPETITIVE_LIMIT`,
  `route.ts:128-130`), strict validation, `maxDuration = 300`, explicit-ASIN
  mode that bypasses Keepa entirely (`analyzeByASINs`, `route.ts:167-172`).
- **The review collector is live-verified.** `lib/review-collector/providers/`
  (apify primary — real paid run confirmed 2026-07-27, ~$0.005/review
  PAY_PER_EVENT; rainforest/axesso/scraper fallbacks via `registry.ts`).
- **The right competitor ASINs are now stored per analysis** — item ב's
  `signal_evidence.revenue.value.top_competitor_revenues[].productId`
  (niche-scoped, category-filtered, brand-deduped), with
  `review_velocity.value.top_competitors[]` as fallback (10 entries after
  the 2026-07-28 MARKETPLACE_NEW fix). No new competitor discovery needed —
  the V4 trigger passes explicit ASINs from the analysis itself.
- **UI language exists.** The Record's chapter pattern
  (`components/partner/record/ChapterPage.tsx` + `RecordCard`), the
  measured/judgment markers, and the Brief's `InterrogationSheet`
  trigger-a-deeper-layer interaction pattern.
- **Nothing to reuse for storage — verified absent:** no
  `competitive_review*`/`market_report` table exists in any migration
  (grep 2026-07-28). The engine's output is currently ephemeral JSON.

## 2. Existing architecture touched (and one compliance gap found)

- `CompetitiveReviewEngine` — consumed as-is; only caller-supplied options
  change (smaller, cost-safe values).
- The generic `/api/reviews/*` routes — untouched (they stay the
  power-user/diagnostic surface).
- **Found during this audit:** `lib/review-engine/ai/claude.ts:18-29` calls
  `anthropic.messages.create()` with NO explicit 429/credit-exhaustion
  handling, no bounded backoff, no graceful degradation — a direct
  `llm-cost-rate-governance` violation (that checklist exists because this
  repo already had a real credits-exhaustion incident). This engine
  predates the policy. The new user-facing trigger cannot ship on top of a
  non-compliant call site: the new route wraps the engine call and
  classifies rate/credit errors into an honest, retryable user message —
  and a bounded-retry wrapper is added at the `ClaudeProvider.complete`
  boundary (smallest compliant point, benefits all callers).

## 3. Files to change

1. **`supabase/migrations/03X_competitive_review_reports.sql`** (new;
   data-database-agent scope; security-compliance-agent review REQUIRED —
   new RLS): `competitive_review_reports` — `id`, `analysis_id` (FK →
   analyses, UNIQUE), `user_id`, `report jsonb`, `engine_version`,
   `asins_analyzed text[]`, `created_at`. RLS: owner-only select/insert.
   UNIQUE(analysis_id) is the pay-once guarantee.
2. **`app/api/analyses/[id]/competitive-reviews/route.ts`** (new, thin):
   - `GET` — return the stored report (ownership-checked), or 404.
   - `POST` — ownership check → if a report exists, return it (never
     double-spend) → resolve ASINs from the analysis' own stored fields
     (top_competitor_revenues first, top_competitors fallback; 400 if
     neither) → run `analyzeByASINs` with fixed conservative options
     (`max_products: 5`, `reviews_per_product: 40`, `sort_by: 'helpful'`)
     → persist → return. Reuses `checkRateLimit` with the existing
     `REVIEWS_COMPETITIVE_LIMIT`. `maxDuration = 300`.
3. **`lib/review-engine/ai/claude.ts`** — bounded retry w/ backoff on 429/
   5xx (max 3 attempts), explicit error classification for rate/credit
   exhaustion (per §2). No behavior change on success paths.
4. **`lib/partner-copy-record.ts`** — pure mapper `MarketReport` → Record
   view-model (gaps with prevalence, winner features, per-competitor
   complaint lists — every number from the engine, marker rules: counts/
   prevalence = measured, AI-synthesized theme text = judgment).
5. **`components/partner/record/CompetitiveReviews.tsx`** (new) + a trigger
   block in the Competition chapter path of `ChapterPage.tsx`: "Interrogate
   the competitors' reviews" → cost-honest confirm line → run (progress
   state; the call takes 1–3 real minutes) → render; on revisit, GET shows
   the stored report immediately.
6. **Tests** — route (auth/ownership/409-style reuse/no-ASINs 400), mapper
   unit tests, claude-retry unit test.

**Process note (standing policy):** after this document is approved, the
new Record section goes through the design-review gate (high-fidelity
mockup → owner approval) BEFORE production UI code.

## 4. Risks

- **Real money per click** (~$1.0–1.5 Apify at 5×40 + ~$0.5–1.0 Anthropic
  ≈ **$1.5–2.5 per interrogation**). Controls: UNIQUE(analysis_id) pay-once
  + stored-report reuse, existing rate limit, fixed server-side options
  (client can't request 500 reviews), and a cost-honest confirm in the UI.
- **Long runtime** (1–3 min): handled with an in-flight state; if the user
  navigates away and returns, GET serves the finished stored report. A
  double-POST race is absorbed by the UNIQUE constraint (second insert
  fails → return the stored row).
- **Provider variance:** Apify per-ASIN failures already degrade per-product
  (`ProductInsight.error`) — surfaced honestly, never hidden.
- **Governance retrofit regression risk** (claude.ts is shared with the
  other review routes): retry wrapper is additive with success-path
  behavior byte-identical; covered by unit test.
- **Stale model id** (`claude-sonnet-4-6` default): works today; upgrading
  is deliberately NOT bundled here (output-shape recalibration risk) —
  noted as its own follow-up decision.
- **RLS/new table:** mandatory security-compliance-agent review before
  merge (standing rule for RLS-related migrations).

## 5. Testing plan

- Unit: mapper (report→VM incl. marker assignment), claude retry
  (429→backoff→success; exhaustion→classified error), route guards.
- `npx tsc --noEmit`, full `npx vitest run`, `npm run build`.
- **Live validation (real spend, ~$1.5–2.5, owner-approved at execution
  time):** one real POST against one of the owner's fee-bearing analyses
  (e.g. Women's Creatine Collagen — 5 stored niche ASINs); verify real
  complaints/gaps return, the row persists, a second POST returns the
  stored report with zero new spend, and the Record renders it.
- Playwright pass on the new section (desktop + mobile widths).

## 6. Smallest-correct-scope

One table, one thin route, one mapper, one Record section, one governance
retrofit at the existing call boundary. Fixed 5×40 options. Trigger only
from the Record's Competition chapter. Everything else consumes the engine
unchanged.

## 7. Non-goals

- **No auto-run during generate** — every analysis would silently cost
  +$1.5–2.5; interrogation stays a deliberate user action.
- **No scoring/verdict integration** — MarketReport scores stay display-
  only; wiring them into the Decision Engine is a separate calibration
  milestone.
- **No model upgrade** for the review AI (separate decision, see Risks).
- **No changes to the generic `/api/reviews/*` routes**, no
  category-node-resolution path in the V4 flow, no backfill, no Compare/
  Desk surfaces, no export.
- **Not fixing** consumer-intelligence's 2-product scrape or its overlap
  with this engine — different layer (Brief's customer language), untouched.
