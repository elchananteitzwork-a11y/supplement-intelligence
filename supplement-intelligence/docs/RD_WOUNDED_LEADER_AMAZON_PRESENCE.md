# R&D: Wounded Leader + Amazon First-Party Presence
## Two Competition-chapter signals from already-fetched Keepa data

Owner-approved direction 2026-08-04 ("I liked the first two — build a plan,
use all agents and skills, deep research"). Built from three tracks: a live
3-niche leader-stats probe (this session), a code architecture audit
(architecture-agent), and external evidence research
(research-evidence-agent). Both signals follow the Entry Proof / Entry
Outcomes lineage: data already fetched and currently discarded, pure
detection, display-only, disclosed uncalibrated constants.

## 0. Research findings that shaped the design

- **Historical rating data is real and unread**: the fetch already
  requests `stats=365&rating=1`; RATING(16) and COUNT_REVIEWS(17) at
  avg90/avg365 are populated with real values (live probe, 3 niches) and
  NOTHING in the codebase reads them — 0 uses vs 12 'current'-only reads
  (architecture audit). Same "fetched, discarded" unlock as Entry Proof.
- **Review-count history is CONTAMINATED and excluded from v1** (live
  probe): Nature's Bounty showed a −26,019 swing vs its 90-day average —
  Amazon review purges / variation-family splits, not demand decay. A
  naive "review velocity" wound would scream on data noise. v1 wounds
  exclude review velocity entirely (disclosed); a discontinuity-guarded
  version is future work.
- **No externally grounded thresholds exist** (research agent): rating→
  sales causality is real (Floyd et al. 2014 meta-analysis, elasticity
  ≈0.78) but every concrete cutoff in circulation (−0.2 stars, 4.5→4.0
  cliffs, "review pace halved") is vendor folklore with no public
  methodology. Every constant below is a disclosed judgment call.
- **The Amazon-brand list, live-confirmed**: Amazon Elements + Solimo
  actively sell supplements today (indexed store pages, 30+/91 SKUs);
  Amazon Basics sells supplements in practice (our own live probe:
  creatine monohydrate, ~9,000/mo); Revly was folded into Elements
  (alias, not a separate brand); Happy Belly / Amazon Basic Care /
  Mama Bear are adjacent (grocery/OTC/kids) — included as aliases with
  disclosed best-effort coverage. The 2023 private-label purge killed
  clothing/furniture lines, not consumables.
- **The seller "never compete with Amazon" veto is HALF-true** (research
  agent) — and the display must reflect both halves: self-preferencing
  is documented at the strongest evidence tier (NBER w30894: Amazon-brand
  rank prominence worth 30-60% of sponsored placement; FTC complaint:
  Amazon-brand status predicted top rank 70% of the time, beating stars
  and review counts) — BUT Amazon house brands are only ~1% of Amazon's
  sales overall (Bloomberg/Numerator), far below Bezos's 10% target.
  Therefore: the PRESENCE is a fact we state confidently with real
  numbers; the CONCLUSION ("don't enter") is explicitly not ours to make.

## 1. Reuse audit (architecture-agent, file:line confirmed)

- Fetch: `stats=365&rating=1` on every product (keepa.ts:1005-1017);
  `statVal(p.stats, 'avg90'|'avg365', CSV.RATING|COUNT_REVIEWS)` works
  today, unused. Per-product buybox identity exists: `buyBoxIsAmazon` /
  `buyBoxSellerId === 'ATVPDKIKX0DER'` (KeepaStats :87-89, live-confirmed
  2026-07-08) — available on queryProducts, not currently extracted.
- **Leader identity**: `top_competitor_revenues[0]` (revenue-sorted,
  guard-1+2-filtered, the Entry Proof/Outcomes anchor). Deliberately NOT
  `biggest_competitor` (different definition, LLM/re-fetch path) — mixing
  them would put two different "leaders" in one Record. Known pre-existing
  gap out of scope: top_competitors' "#1 by review count" docstring vs its
  actual search-relevance order (real-competitor.ts).
- **Anti-duplication constraints** (audit): `price_compression_pct` is a
  CATEGORY-level aggregate — the leader's price wound must be computed on
  the leader's own row or it silently duplicates an existing kill-switch
  proxy. `amazon_buybox_pct`/`amazon_oos_pct` are category-wide — Signal B
  must recompute niche-scoped from queryProducts.
- Curated-data-file precedent: `lib/science-engine/ingredient-vocabulary.ts`.

## 2. Files to change

1. `lib/signal-engine/measured-competitor-economics.ts`:
   - `MeasuredCompetitorInput` gains optional null-safe historicals:
     `ratingCurrent`, `ratingAvg365`, `priceAvg365`, `buyBoxIsAmazon`
     (same convention as reviewCount/listingAgeMonths).
   - Pure `detectWoundedLeader(rows, ...)` over the guarded table's
     leader row ONLY (single-leader signal, not a ladder). Wounds (each
     independent, each rendered with its real numbers, all constants
     disclosed judgment calls per §0):
     a. **Rating slide**: current − avg365 ≤ `WOUND_RATING_DRIFT` (−0.2)
     b. **Rating gap**: leader rating ≤ (median rating of the other
        measured rows) − `WOUND_RATING_GAP` (0.3) — the live Create case
        (4.0 vs a 4.4-4.5 pack). CRITIQUE FIX (round 3): requires ≥
        `WOUND_MIN_RATED_PEERS` (4) rated peer rows — a 2-3-row median
        is too unstable to indict a leader.
     c. **Price climb**: leader price ≥ priceAvg365 × (1 +
        `WOUND_PRICE_CLIMB_PCT` 0.10) — leader-row specific, distinct
        from the category aggregate. CRITIQUE FIX (round 3): both
        horizons MUST come from the SAME price slot — the existing price
        uses a fallback chain (fba → buybox → amazon → new), and mixing
        an avg90 pick from one slot with avg365 from another compares
        different price types and fabricates wounds. keepa.ts picks the
        winning slot first, then reads avg90+avg365 from it; missing
        avg365 on that slot → wound skipped null-safe.
     Returns null when no wound (absence over weak claims) or when the
     leader lacks the needed historicals (null-safe skip per wound).
     Review-velocity wound: explicitly NOT in v1 (§0 contamination).
   - Pure `detectAmazonPresence(inputs, ...)`: house-brand rows detected
     via the curated list (brand match on the RAW deduped young+old set,
     with each hit's real monthly_sold), plus niche-scoped 1P share:
     count of queryProducts rows with buyBoxIsAmazon true. Returns null
     when neither fact exists.
2. `lib/signal-engine/amazon-brands.ts` (new, curated data): canonical +
   aliases — amazon basics, amazon elements (alias: revly), solimo,
   happy belly, amazon basic care, mama bear. Header discloses
   best-effort coverage and the 2023-purge context.
3. `lib/signal-engine/providers/keepa.ts` — extract the four new fields in
   `measuredCompetitorInputs` (:1542-1572, where p.stats is in scope);
   call both detectors beside detectEntryProof; attach additive
   `wounded_leader` / `amazon_presence` on RevenueSignal.
4. `lib/signal-engine/types.ts` — the two additive optional fields.
5. `lib/partner-copy-record.ts` — Competition rows (marker measured):
   - Wounded Leader (one row listing only REAL wounds found):
     "Leader shows cracks: rating 4.2 (down from 4.5 a year ago); price
     up 12% vs its yearly average" — numbers only, no attack advice.
   - Amazon presence (fact, not verdict — §0):
     "Amazon's own brand sells here: Amazon Basics at ~9,000/mo" and/or
     "Amazon itself is the retailer for 6 of 18 top listings" —
     CRITIQUE FIX (round 3): 1P buybox means Amazon-as-RETAILER
     (vendor-supplied brands), NOT Amazon competing with its own brand;
     the wording must never conflate the two facts. The evidence
     context (self-preferencing documented / house-brands ~1% of sales)
     goes to the appendix caveat line, not the row.
6. `scripts/truth-audit.ts` — C-family recomputation checks for both.
7. Tests: wound detection per wound + null-safety + no-wound → null;
   leader-row-only scoping; amazon-brand matching incl. aliases +
   niche-scoped 1P counting; display rows; audit checks.

## 3. Risks

- **Thresholds are folklore-adjacent** — every constant is disclosed as a
  judgment call (no research grounding exists, §0); display shows raw
  numbers so a reader can apply their own bar. No scoring input for
  either signal (same verdict as Entry Outcomes).
- **Rating drift granularity**: Keepa rating is in 0.1 steps; −0.2 is 2
  ticks — small-sample flapping possible; the row always shows both
  values so borderline reads are transparent.
- **Amazon-brand list incompleteness**: curated best-effort (disclosed);
  additions are one-line data PRs. False negatives possible; false
  positives essentially impossible (exact brand match).
- **buyBoxIsAmazon availability**: live-confirmed on the field level
  (2026-07-08 per code comments) but share-of-niche coverage varies;
  null-safe counting only over rows where the field exists, disclosed
  denominators ("6 of 18 with buybox data").
- **Leader churn**: the leader row can change between analyses (data
  moves); each analysis states its own leader by name — no cross-run
  identity claim.

## 4. Testing plan

- Unit per §2.7; `npx tsc --noEmit`; full vitest; build.
- Live validation (Keepa tokens only): provider-level run on niches with
  known shapes — creatine monohydrate (Amazon Basics present — must
  fire), magnesium glycinate (healthy leaders — wounded leader must stay
  silent), creatine gummies (Create at 4.0 vs 4.4-4.5 pack — rating-gap
  wound should fire), + 2 fresh niches. Truth-audit re-run clean.

## 4b. Live validation results (2026-08-04, executed)

5 niches (3 design-informed + 2 fresh: apple cider vinegar gummies,
vitamin d3 k2), full pipeline:
- **House brands: perfect.** Amazon Basics fired exactly where expected
  (creatine monohydrate ~9,000/mo; ACV gummies ~800/mo) and stayed
  silent everywhere else.
- **1P-buybox share: REMOVED by this validation.** Without the buybox=1
  request param, buyBoxIsAmazon was populated for only 1-4 of ~15 rows —
  and ~100% of those were Amazon in EVERY niche (3/3, 4/4, 1/1...): a
  biased denominator that would have printed "Amazon holds the buybox on
  all known listings" on every report. The fact was stripped from the
  signal, the display, and the types (the raw input field remains
  extracted + documented as the basis for future buybox=1 work).
- **Wounded leader: silent on all 5** — consistent with the probe (all
  sampled leaders healthy: +0.1 rating drifts, stable prices); the
  wound machinery is exercised by unit tests on real-shaped fixtures
  (incl. the live Create 4.0-vs-4.5 case). A live firing awaits a
  genuinely wounded leader in the wild — silence here is correct, not
  missing coverage.

## 5. Smallest-correct-scope

Two pure detectors + one curated data file + four extracted fields, two
additive signal fields, two Competition rows + one appendix context line,
audit checks, tests. No scoring, no new fetches, no UI components, no
review-velocity wound (v1).

## 6. Non-goals

- **No "attack now" / "avoid" advice** — facts with real numbers only;
  the conclusion belongs to the reader (the veto is half-folklore, §0).
- **No review-velocity wound in v1** (purge/split contamination — needs
  a discontinuity guard, future work).
- **No OOS/stockout wound in v1** (per-product OOS data unverified on
  the niche set; external evidence weak-tier; future candidate).
- **No scoring impact** for either signal (no grounded thresholds exist).
- **No cross-run leader tracking** ("the leader is declining ACROSS our
  analyses" needs the Verdict Ledger timeline — different milestone).
- **No backfill.**
