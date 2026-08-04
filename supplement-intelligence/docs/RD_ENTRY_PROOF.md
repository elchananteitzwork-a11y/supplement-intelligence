# R&D: Entry Proof — low-review sellers moving real volume

Owner-initiated 2026-08-02: "one of the criteria that decides whether a
market is worth entering is seeing someone who opened a company, has few
reviews on Amazon, and still sells a nice monthly volume — that's a very,
very good indication." This is direct, measured evidence that the niche is
penetrable without an established review moat — the strongest possible
counter-signal to "this market is locked up by incumbents."

## 1. Reuse audit

- **Every input is already fetched — some of it is currently discarded.**
  The query-specific /search products (`queryProducts`, the slice of 20)
  are fetched with `&stats=365&rating=1`
  (`lib/signal-engine/providers/keepa.ts:1016-1017`), so each product
  object simultaneously carries: `monthlySold` (top-level, :118),
  `COUNT_REVIEWS` via `statVal(p.stats,'current',CSV.COUNT_REVIEWS)`
  (:59, requires the rating param — already set), and `listedSince`
  (:131, converted by `listedSinceToAgeMonths`, :603). When
  `measuredCompetitorInputs` is built (:1542-1565) only
  productId/brand/price/monthlySold/categoryLevel1Id survive — review
  count and listing age are dropped. This milestone stops discarding
  them. Zero new API calls, zero new tokens.
- **The integrity guards already exist and apply unchanged.**
  `buildCompetitorRevenueTable` (`lib/signal-engine/
  measured-competitor-economics.ts`) already runs the three live-probe
  traps: dominant-category filter (OTC contamination), brand dedupe
  (size-variant double-count), ≥2-products floor. Entry-proof detection
  runs on its OUTPUT rows, inheriting all three for free.
- **Floor semantics already established**: monthlySold is Amazon's
  rounded-down band (types.ts:125-131 comments; partner-copy-record.ts
  `fmtMeasuredMonthly` header :55-56) — an entry-proof example's volume
  is therefore itself a floor, which only strengthens the claim ("sells
  AT LEAST ~N/mo").
- **Precedent for exactly this shape of milestone**: item ב
  (docs/RD_V4_NICHE_COMPETITOR_ECONOMICS.md) — same "stop discarding
  already-fetched /search data → pure module → additive RevenueSignal
  fields → Record/appendix surfacing" pipeline, shipped and
  live-validated 2026-07-28.
- **Related-but-different existing signals** (no overlap, no conflict):
  `reviewCountToBarrierScore` (keepa.ts:271) scores the AVERAGE review
  moat of category bestsellers for marketAccessibility — it measures how
  high the wall is. Entry proof measures whether someone actually climbed
  it anyway, per-product, on the query-specific set.
  `computeSupplyVelocity` (:809) measures young-listing SHARE — how many
  entered — not whether any entrant is succeeding.

## 2. Existing architecture touched (read/extend, no behavior change)

- `lib/signal-engine/measured-competitor-economics.ts` — input/row types
  widened (additive optional fields), detection helper added (pure).
- `lib/signal-engine/providers/keepa.ts` — `measuredCompetitorInputs`
  mapping captures two more already-present fields.
- `lib/signal-engine/types.ts` — `RevenueSignal.top_competitor_revenues`
  row gains optional `review_count` / `listing_age_months`; new optional
  `entry_proof` summary field.
- `lib/partner-copy-record.ts` — one Competition-chapter row + a reviews
  column on the appendix competitor table.
- Scoring/verdict/confidence: untouched (see Non-goals).

## 3. Files to change

1. `lib/signal-engine/measured-competitor-economics.ts`:
   `MeasuredCompetitorInput` + `CompetitorRevenueRow` gain optional
   `reviewCount` / `listingAgeMonths` (null-safe: absent stats stay
   null, never fabricated 0). New pure `detectEntryProof(rows)` —
   **niche-relative and cliff-free by design** (owner design input
   2026-08-02: absolute thresholds would silently drop
   just-under-the-line products that are still good evidence):
   - No row is ever excluded. Every row with non-null review_count and
     monthly_sold gets a continuous disproportion measure:
     `sales_share ÷ review_share` (its share of the niche's measured
     units ÷ its share of the niche's total reviews, reviews floored at
     1 to avoid division by zero). Dimensionless, niche-adaptive — a
     product "punching above its review weight" scores high in ANY
     size of niche, with no absolute number anywhere.
   - Rows are returned ranked by disproportion, each carrying its real
     numbers. Thresholds affect EMPHASIS ONLY, never inclusion: the
     headline example is the highest-ranked row meeting (a) review_count
     below the niche median, (b) disproportion ≥ 2, (c) monthly_sold ≥
     half the niche median (adversarial-critique fix 2026-08-02: without
     a niche-relative volume floor, a 60-units/mo seller in a huge niche
     could headline on ratio alone — the owner's criterion is a NICE
     volume, not just a disproportionate one), and (d) not an
     established brand's line extension (critique fix: a low-review
     listing from a brand that has ANOTHER product with ≥1000 reviews in
     this same analysis's fetched data sells on brand equity + ad
     budget, which is not proof a new company can enter; best-effort
     check against our own fetched sets only, disclosed as partial).
     All four are disclosed, commented initial values (same convention
     as VELOCITY_THRESHOLD_PCT) — they choose which example gets the
     Record headline row, and a product that misses them still appears
     in full in the appendix table.
   - Price-dump disclosure (critique fix): when the headline's price is
     below 60% of the niche median price, the display appends the real
     prices ("at $9 — typical here $24") — volume bought by deep
     discounting is disclosed, not hidden and not silently excluded.
   - `listing_age_months <= 24`, when present, marks an example
     `recent: true` (corroboration, never a requirement — listedSince
     is sometimes absent).
2. `lib/signal-engine/providers/keepa.ts` (:1542-1565): capture
   `reviewCount` (statVal current COUNT_REVIEWS — null when stats
   missing; 0 is a real observed zero) and `listingAgeMonths`
   (listedSinceToAgeMonths) into `measuredCompetitorInputs`.
3. `lib/signal-engine/types.ts`: additive optional row fields +
   `entry_proof?: { examples: {...}[]; count: number }` on RevenueSignal.
4. `lib/partner-copy-record.ts`: Competition chapter — when a headline
   example qualified, one `measured` row:
   claim "Proof of entry — low-review seller moving volume", value e.g.
   "BrandX: ~3,000/mo with only 45 reviews" (floor tilde, real numbers).
   Appendix competitor table gains a "Reviews" column on EVERY row
   (real count, or "—" when null) — the full continuum is always
   visible regardless of what the headline logic picked, so no
   borderline product is ever hidden. Both render nothing when the
   data is absent (legacy analyses unaffected).
5. Tests: detection thresholds/boundaries (299/300, 150/151, null
   review_count excluded, age-corroboration flag), keepa mapping
   null-safety, Record row + appendix column presence/absence, and the
   truth-audit marker rule (the new row is genuinely measured — every
   number in it traces to raw Keepa fields).

## 4. Risks

- **False "proof" from mislabeled products**: a low-review listing
  selling volume could be an off-category interloper — mitigated free by
  running detection AFTER the dominant-category filter + brand dedupe.
- **review_count 0-vs-null ambiguity**: statVal returns null when the
  stats slot is missing; a real 0 is a real number. Detection requires a
  non-null review_count ≤ threshold; null rows are excluded (absence is
  never evidence).
- **Variation-consolidated review counts**: Amazon aggregates reviews
  across variations; a "45-review" listing might share reviews with
  siblings. The displayed number is Keepa's real per-ASIN COUNT_REVIEWS
  — disclosed as-is; no attempt to un-consolidate (out of scope, noted
  in the row's tooltip-free honest phrasing "only N reviews").
- **Threshold miscalibration**: the two emphasis constants (median
  cutoff, 2× disproportion) are initial guesses with the standard
  disclosed-constant convention — but by design they can only cost a
  HEADLINE, never information: every product's reviews/sales stay
  visible in the appendix table, so a miscalibrated constant
  under-emphasizes, it never hides. The single-example display format
  keeps the claim verifiable ("go look at BrandX yourself").
- **Small-n noise in shares**: niches with only 2-3 measured rows make
  share-based disproportion coarse — acceptable because the output is
  ranked real examples (verifiable numbers), not a synthetic score fed
  anywhere; disclosed in the detection helper's header comment.
- **Schema ripple**: all new fields optional — old stored memos render
  exactly as before (verified by existing partner-copy-record tests).

## 5. Testing plan

- Unit tests per §3.5; `npx tsc --noEmit`; full vitest; build.
- Live validation (cheap, reuses existing flow): one real analysis on a
  niche known to have young low-review sellers moving volume; confirm
  the entry_proof examples carry real ASINs/brands/numbers matching the
  raw Keepa response, the Record row renders, and `scripts/
  truth-audit.ts` (extended with an entry-proof check family or run
  as-is on the new analysis) reports zero findings.

## 6. Smallest-correct-scope

Two captured-not-discarded fields, one pure detection helper with two
disclosed constants, additive optional signal fields, one Record row +
one appendix column, tests. No new providers, no new fetches, no scoring
change, no new UI components.

## 7. Non-goals

- **No scoring/verdict impact** — entry proof surfaces as measured
  evidence only. Wiring it into marketAccessibility or the verdict
  matrix is a future milestone requiring its own R&D (and ideally real
  outcome data), not a silent weight change.
- **No DISPLAYED ratio metric** — the disproportion measure is
  internal ranking machinery only; showing a derived ratio would
  invite false precision on banded (floored) monthlySold. The user
  always sees the two real numbers side by side instead.
- **No review-authenticity analysis** (fake-review detection is a
  different problem).
- **No un-consolidation of variation review counts** (disclosed risk
  above).
- **No historical backfill** — only new analyses get the fields (same
  no-backfill precedent as item ב).
