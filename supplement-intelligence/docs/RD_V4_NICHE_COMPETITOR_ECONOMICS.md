# R&D: Niche-Scoped Competitor Economics (item ב of the core-economics plan)

Owner-approved direction (2026-07-27) after two self-critique rounds. Round-1
finding: the current revenue read comes from category-node bestsellers and
survives the relevance gate with n=1 in most real analyses — an average that
would mislead if surfaced. Round-2 finding (live Keepa probe on 3 real niche
queries from the owner's own analyses): `/search` on the niche query itself
yields 10 products with `monthlySold` present on 80% of them (10/10, 9/10,
5/10) — enough for a real per-competitor revenue table. This document turns
that verified finding into the smallest correct implementation, including the
three integrity guards the probe exposed.

## 1. Reuse audit

- **The niche-scoped product fetch already exists and already carries the
  needed data.** `lib/signal-engine/providers/keepa.ts:1004-1046`
  (`fetchSearchAsins`) already pulls up to 8 query-specific ASINs per
  analysis, and they already flow through the same `fetchProducts`
  (`keepa.ts:958`, `stats=365`) whose response already includes
  `monthlySold` (`keepa.ts:117`) and `categoryTree` per product. **Zero new
  Keepa calls; the data is fetched today and discarded.**
- **Per-product revenue math already exists** for bestsellers:
  `price × monthlySold` at `keepa.ts:1167-1168`; the same arithmetic is
  reused per search product.
- **The storage path already exists.** `RevenueSignal`
  (`lib/signal-engine/types.ts:65`) is persisted per analysis inside
  `memo_data.signal_evidence.revenue.value` (verified by direct DB
  inspection 2026-07-27, 53/100 recent analyses). New fields ride the same
  JSONB — no migration.
- **The additive-optional-fields pattern is established** on this exact
  data family: `top_competitors[]`'s own history of additive fields
  (`types.ts:402-456` — breadcrumb, listing_age_months, claim_risk_flags…).
- **The render surfaces already exist.**
  - The appendix's `competitorsNote`
    (`lib/partner-copy-record.ts:197`) literally promises this table as "a
    fast follow"; `components/partner/record/EvidenceAppendix.tsx` already
    renders ledger-style keyword rows the table can mirror.
  - The Record's Economics/Competition chapters
    (`lib/partner-copy-record.ts:93-107, 74-91`) take one-line
    `RecordRow`s; item א just shipped the same pattern.
- **Relevance gating reuses** `checkKeywordRelevance` + `hasWordOverlap`
  exactly as `computeKeepaReviewVelocity` (`keepa.ts:427-440`) already
  applies them to the same search products.

## 2. Existing architecture touched (read-only or byte-identical)

- `computeKeepaReviewVelocity` and `top_competitors[]` — untouched. The new
  table deliberately does NOT live on `ReviewVelocitySignal`: when Apify's
  junglee provider is also up, the engine blend makes Apify (confidence
  0.80) `primarySource` for review_velocity, and per the
  `AggregatedDimension` contract (`types.ts:498-502`) the blended value's
  non-numeric fields come from the primary source only — a Keepa-only
  enrichment there would silently vanish whenever Apify fires. The
  `revenue` dimension is produced by Keepa alone, so it is the one home
  where the fields always survive aggregation.
- Scoring, confidence, verdicts, engine blending: untouched. The existing
  `revenue.score` formula is not changed by the new fields.
- The `/search` slice stays at 8 (no token-cost increase this milestone).

## 3. Files to change

1. **`lib/signal-engine/measured-competitor-economics.ts` (new, pure).**
   Exported helpers, no I/O:
   - `filterToDominantCategory(products)` — guard 1 (class contamination:
     the live probe showed OTC drugs like Midol passing word-overlap
     relevance for "Period Bloating Relief"). Deterministic rule: keep
     products whose `categoryTree[1]` (second level) matches the majority
     among relevance-passing products; return the excluded count for
     disclosure.
   - `dedupeByBrand(products)` — guard 2 (The Missing Link 1lb + 5lb double
     count): keep the highest-`monthlySold` listing per normalized brand.
   - `buildCompetitorRevenueTable(products)` — per surviving product with
     `price` and `monthlySold` both present: `{ productId, brand, price,
     monthly_sold, est_monthly_revenue_mo: price × monthlySold }`, sorted
     by revenue desc, plus aggregates `measured_revenue_total_mo` and
     `revenue_concentration_top1` (leader ÷ total).
2. **`lib/signal-engine/types.ts`** — additive optional fields on
   `RevenueSignal`:
   `top_competitor_revenues?: {...}[]`, `measured_revenue_total_mo?: number`,
   `revenue_concentration_top1?: number`,
   `off_category_excluded_count?: number`.
3. **`lib/signal-engine/providers/keepa.ts`** — inside `computeSignals`'s
   existing revenue block (`~1471`): call the pure helpers on
   `queryProducts` (already in scope) and attach the results. Populated
   only when ≥2 relevant search products carry `monthlySold` — a
   one-product "table" is the n=1 trap round 1 caught, never shown.
4. **`lib/partner-copy-record.ts`** —
   - Economics row: `~$X/mo` total across the measured set (marker:
     measured), gated on the new aggregate field.
   - Competition row: leader's share of measured revenue (marker:
     measured), gated the same way.
   - `buildEvidenceAppendixVM`: emit the real per-competitor table when
     present; keep today's `competitorsNote` verbatim as the fallback for
     analyses without it.
5. **`components/partner/record/EvidenceAppendix.tsx`** — render the table
   in the appendix's existing ledger language, inside an `overflow-x-auto`
   container (repo-wide wide-content rule), values prefixed `~` with one
   footnote line: Amazon reports monthly units in rounded-down bands, so
   every figure is a floor (guard 3).
6. **Tests** — new `lib/signal-engine/__tests__/measured-competitor-economics.test.ts`
   (majority-category filter incl. the Midol case shape, brand dedupe
   keep-max, aggregates, <2-product suppression); extend
   `lib/__tests__/partner-copy-record.test.ts` (rows/table present when
   fields exist, absent + note-fallback otherwise).

## 4. Risks

- **Both fee-style guards are disclosed judgment calls** (second-level
  category majority; brand-level dedupe). Both are deterministic and
  documented in-code; neither invents a number. A niche whose results are
  legitimately split across categories loses some rows to the filter — the
  excluded count is stored (`off_category_excluded_count`) so the appendix
  can say so instead of hiding it.
- **Apify-primary analyses gain nothing on review_velocity — by design.**
  The table lives on `revenue` (Keepa-only), so it appears whenever Keepa
  search yielded ≥2 measured relevant products, independent of which
  provider won review_velocity.
- **monthlySold banding** (20000/3000/300… rounded down): mitigated by the
  `~` convention + floor footnote; totals are sums of floors, stated as
  such.
- **Historical analyses** (all 100 current ones) lack the new fields —
  appendix falls back to today's exact note; chapters render no new rows.
  No backfill (real provider cost), same policy as item א.
- **Regression surface:** the only edited production function is the
  revenue block of `computeSignals` — covered by keeping all existing
  fields byte-identical and running the full suite; the new logic is in
  pure, separately-tested helpers.

### Live-validation amendments (2026-07-28, during implementation)

The §5 live run caught two real facts this document originally got wrong,
both fixed before shipping:

1. **The search slice is 5, not 8.** `buildAsinSets`
   (`keepa.ts:850-861`) caps query ASINs at 5 inside the combined
   10-ASIN `/product` call — the 8 in `fetchSearchAsins` is pre-merge.
   Tables therefore top out at n≤5 per analysis. Accepted (raising it is
   real token cost, explicitly non-goaled); revisit only with owner
   sign-off on the cost.
   **SUPERSEDED 2026-07-28 — raised to 20 with owner sign-off**, decided
   by a real sample-size experiment (6 of the owner's own niche queries,
   full top-20 fetched, production gates applied at every n from 3 to 20):
   - The concentration read is untrustworthy below n≈15: at n=5 the
     Cortisol niche showed leader-share 83% vs a true 36% (a 47-point
     error that reads as "locked market" when it's actually fragmented);
     even n=12 still showed 65%.
   - Big sellers hide deep: rank 13-15 held the product that took
     Cortisol's revenue coverage from 45%→97%; Magnesium's biggest sat at
     rank 16-20.
   - The tail is NOT noise: ranks 13-20 measured 75% relevance-pass
     (higher than ranks 6-8's 61%) and 83% monthlySold presence.
   - Sparse niches only clear the ≥2 floor deep in the tail (Period
     Bloating Relief gets its first real table at n=20).
   New caps: search 20 (`fetchSearchAsins` + `buildAsinSets`), combined 25
   (20 search + 5 bestseller backfill — category-signal sample unchanged).
   Measured cost: ~3.5 tokens/ASIN → ~+50 tokens/analysis (≈2× total).
   Consumer-intelligence review scraping verified unaffected
   (`MAX_SOURCE_PRODUCTS = 2`); `top_competitors` stays sliced to 10.
   Post-change live run (Cortisol, real provider path): 15 rows,
   ~$719k/mo, top1 36% — matches the experiment's ground truth exactly.
2. **The price chain was missing the one slot many 3P listings actually
   have.** CONFIRMED VIA LIVE CALL: the niche's 20k-units/mo leader
   (B0DJDQCJX2) has `-1` in AMAZON/NEW_FBA/BUYBOX and a real price only
   in `MARKETPLACE_NEW[1]` (no `offers` param on our requests) — the
   original 3-slot chain yielded ZERO measured competitors for the
   strongest probe niche. Fixed by appending `CSV.MARKETPLACE_NEW` as the
   lowest-priority fallback in this feature's extraction only. The same
   gap exists in `computeKeepaReviewVelocity`'s competitor pricing
   (creatine run: `competitors: 0`) — observed, deliberately NOT touched
   here (§7), tracked as an adjacent follow-up.

Post-fix live result: creatine → real 5-row table, total ~$752k/mo floor,
leader share 0.82; bloating-relief → table correctly suppressed (only 1
measured product after guards). Both §5 criteria met.

## 5. Testing plan

- Unit tests as in §3.6 (pure helpers get exhaustive cases; the Midol
  fixture mirrors the real probe output shape).
- `npx tsc --noEmit` clean; full `npx vitest run` green (1183 must stay
  green).
- **Live validation before marking complete:** temp-script run of the real
  `KeepaProvider` path (same `_tmp_*` convention as the 2026-07-27 probes)
  against 2 of the probe queries — assert the new fields materialize with
  real data and the Midol-class products are excluded for "Period Bloating
  Relief". Cost: ~2 × (10 + 8·2) ≈ 55 Keepa tokens, within the regenerating
  balance (1140 at last check).
- Post-deploy: next real analysis the owner runs — confirm the appendix
  table renders and the two chapter rows appear.

## 6. Smallest-correct-scope

One new pure module + additive optional fields + one populated call site in
the existing revenue block + display gating in the two files that already
own these surfaces. No new providers, no new endpoints, no schema
migration, no scoring change, no extra Keepa tokens, search slice stays 8.

## 7. Non-goals

- **No scoring/verdict/confidence change** — the table is evidence display;
  wiring `revenue_concentration_top1` into competition scoring is its own
  future milestone with its own calibration question.
- **No replacement of `market_size`** (LLM prose headline) — candidate
  follow-up once the measured total exists broadly, not now.
- **No revenue projection scenarios** ("2–5% capture = $X") — explicitly
  deferred; depends on this shipping and settling first.
- **No competitive-review-engine surfacing** — that is item ג, after this.
- **No search-slice increase / no backfill / no Compare changes.**
- **Not touching `top_competitors[]`** or anything Apify-side.
