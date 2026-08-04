# R&D: Entry Outcomes — what happens to the visible young cohort
## (né "Graveyard" — renamed by the evidence)

Owner-directed 2026-08-04 ("think outside the box... build the best plan
with all agents and skills"). Built from three converging research tracks:
a live 7-niche Keepa probe (this repo, scratchpad probe), a code-level
architecture audit (architecture-agent), and external evidence research
(research-evidence-agent). The original idea — count young listings with
NO sales badge as a "graveyard" — was KILLED BY THE DATA and replaced
with the design below; the pivot is the plan's core finding.

## 0. Why the original design died, and what replaced it

- **Live probe (7 real niches, 2026-08-04):** of 42 young (≤24mo)
  listings visible in top-20 search, exactly ONE had no sales badge —
  and it was 0 months old (too new to judge, not failed). Failing
  listings essentially do not appear in top-20: Amazon buries them.
  There are no visible corpses to count.
- **External evidence agrees on the mechanism** (research-evidence-agent):
  28-54% of SERP real estate is sponsored (arXiv 2407.19099;
  Checkbook.org 2025); genuinely failed, unadvertised listings are
  structurally the LEAST likely to surface in any fixed-size sample. Any
  failure count is a floor, and absence of visible failure must never be
  phrased as safety.
- **What the probe DID find discriminates cleanly** — a 4-state taxonomy
  of the VISIBLE young cohort (6-24mo, post-guards):
  | niche | judgeable young | outcome |
  |---|---|---|
  | creatine gummies | 14 | all broke out → WELCOMING |
  | ashwagandha gummies | 7 | all selling → WELCOMING |
  | berberine gummies | 13 | 5 stalled ≤200/mo → CONTESTED |
  | magnesium glycinate | 7 | all mega-brands (Thorne, Nature's Bounty) → CLOSED-TO-INDEPENDENTS |
  | turmeric / ACV gummies | 2-3 | only big brands / category king → CLOSED-TO-INDEPENDENTS |
  | sleep gummies | 2 | too thin → INSUFFICIENT |
  The strongest visible entry warning is not corpses — it is "no
  independent young seller appears at all" (the mega-brands-only state).

## 1. Reuse audit (architecture-agent, all confirmed at file:line)

- **The cohort data is already fetched and partially discarded**:
  `measuredCompetitorInputs` (`lib/signal-engine/providers/keepa.ts:
  1542-1572`) carries price / monthlySold (null = no badge) / brand /
  categoryLevel1Id / reviewCount / listingAgeMonths for every
  relevance-passing search product. The relevance gate (:1543) is
  sales-blind — non-sellers pass it on equal footing. The both-axes
  filter (`measured-competitor-economics.ts:100-102`) is the only point
  that drops them; interception happens before it.
- **Guards reusable as-is**: `filterToDominantCategory` and
  `dedupeByBrand` don't read monthlySold requirements that exclude the
  cohort (dedupe keys `monthlySold ?? -1`, :80-90). Simplest composition
  per the audit: a second pure function taking the raw
  `MeasuredCompetitorInput[]` and re-running both guards — zero change
  to the live, tested `buildCompetitorRevenueTable` return shape.
- **Entry Proof coexistence**: `detectEntryProof` reads only the
  measured rows + brand bases; no exclusivity assumptions. Both signals
  can (and should) render from the same deduped cohort definitions
  (same 24mo window via `ENTRY_PROOF_RECENT_MONTHS`, same
  `ENTRY_PROOF_ESTABLISHED_REVIEW_BASE` for the big-brand test, same
  `fetchedBrandBases`).
- **Storage/display/audit precedents**: additive optional field on
  `RevenueSignal` beside `entry_proof` (types.ts); Competition-chapter
  row beside the entry-proof block (`lib/partner-copy-record.ts`);
  marker system + truth-audit Family-1 arithmetic check
  (`scripts/truth-audit.ts`) for any displayed count.

## 2. External evidence constraints (research-evidence-agent)

- **Badge semantics**: "bought in past month" ≈ >50/mo, ~90% accurate
  within one bucket (Momentum Commerce/PMG) — BUT Amazon staff confirm
  it is a discretionary pilot with real false negatives above threshold.
  Phrasing must be "below ~X/mo by Amazon's own sales badge", never
  "provably not selling".
- **6-month judgment floor**: defensible and evidence-consistent
  (honeymoon 2-4wks, traction windows cluster 1-6mo) but NOT calibrated
  science — a disclosed judgment-call constant.
- **No reliable failure base rates exist anywhere** (supplements or
  general) → there is no external basis to score this signal.
  **Display-only in v1 is the research verdict, not caution for its
  own sake.**

## 3. Files to change

1. `lib/signal-engine/measured-competitor-economics.ts` — pure
   `computeEntryOutcomes(inputs: MeasuredCompetitorInput[],
   fetchedBrandBases)`: re-runs guard 1+2, takes young listings
   (`listingAgeMonths` 0-24, null age excluded — same
   conservative-on-missing-data rule as Entry Proof v2), splits:
   - `small_scale` vs `large_base` young listings — CRITIQUE FIX
     (2026-08-04 round 2): the plan originally classified "big brand" by
     own review_count ≥ 1000, which would misclassify a successful
     independent entrant (real probe case: Inner Brightness, 11mo,
     1,838 reviews — the best possible welcoming evidence) as a giant;
     and without it, Nature's Bounty's young listing classifies as an
     "independent". The truth: our data CANNOT distinguish a giant from
     a successful independent — so the design makes NO brand-identity
     claim at all. `large_base` = own review_count ≥
     `ENTRY_PROOF_ESTABLISHED_REVIEW_BASE` (1000) OR same-brand base
     elsewhere in fetched data — described in copy purely as an
     observation about review scale, never as a brand-identity verdict;
   - judgeable = small_scale young listings aged ≥
     `OUTCOMES_MIN_JUDGE_AGE_MONTHS` (6, disclosed judgment call per §2);
   - per judgeable listing — CRITIQUE FIX (dual anchor, the same lesson
     Entry Proof taught twice): `stalled` = monthly_sold ≤
     min(`OUTCOMES_STALL_MAX_SOLD` = 200, ¼ × niche median sold when a
     measured table exists) or badge absent; `broke_out` otherwise. An
     absolute-only bar would call a near-median seller "stalled" in a
     low-volume niche. Verified on probe data: berberine still counts 5
     stalled under the dual bar;
   - returns counts + member lists (small, verifiable) + a derived
     `state`: `'welcoming' | 'contested' | 'no_small_entrants_visible'
     | 'insufficient'` with disclosed rules:
     insufficient when judgeable < `OUTCOMES_MIN_COHORT` (4);
     no_small_entrants_visible when young cohort ≥ 3 and small_scale
     = 0; contested when stalled share ≥
     `OUTCOMES_CONTESTED_STALL_SHARE` (0.34); welcoming otherwise. All
     constants disclosed, uncalibrated.
2. `lib/signal-engine/providers/keepa.ts` — one call beside
   `detectEntryProof`, result attached as `entry_outcomes` (additive).
3. `lib/signal-engine/types.ts` — optional `entry_outcomes` field.
4. `lib/partner-copy-record.ts` — ONE measured Competition row, state-
   dependent copy built only from real numbers:
   - welcoming: "12 of 13 independent young listings (6-24mo) here are
     selling past ~200/mo" (complements/verifies Entry Proof);
   - contested: "5 of 13 young listings here are stuck at ~200/mo or
     less after 6+ months";
   - no_small_entrants_visible: "Every young listing visible here
     already carries 1,000+ reviews — no small-scale young seller
     appears in top results" (an observation about review scale, never
     a brand-identity claim);
   - insufficient: renders nothing (absence over weak claims).
   Every displayed number traces to stored member lists (marker
   'measured'); the visibility-floor caveat rides the appendix
   footnote pattern ("visible top-search results only — listings that
   failed and lost visibility don't appear here"), NOT the row itself.
5. `scripts/truth-audit.ts` — Family-1 check: displayed counts equal
   recomputation from stored `entry_outcomes` members.
6. Tests — state machine boundaries (each state, each constant edge,
   null-age exclusion, big-brand classification via bases vs own
   reviews, coexistence with entry_proof on the same fixture), keepa
   passthrough, display copy per state, appendix caveat.

## 4. Risks

- **Small-N noise** (architecture finding): 20-ASIN sample shrinks
  through guards; `OUTCOMES_MIN_COHORT` gates every claim, and counts
  are always displayed as "X of N" — the N discloses the sample size
  inherently.
- **Badge false negatives** (external finding): a stalled classification
  can be wrong for a listing Amazon's pilot badge skipped — mitigated by
  band phrasing ("~200/mo or less by Amazon's own sales badge") and by
  stall requiring age ≥ 6mo (a badge-suppressed BUT selling listing
  usually still shows some band eventually).
- **Sponsored-slot contamination**: some visible young listings rank via
  ads, not organic traction — cuts both ways and is disclosed via the
  appendix caveat; no per-listing ad detection exists (out of scope).
- **dedupeByBrand absorption** (architecture finding): a young stalled
  listing sharing a brand with a live seller collapses away — counts are
  floors; the "X of N" phrasing plus appendix caveat carry this.
- **Narrative conflict with Entry Proof**: a niche can show entry proof
  AND contested outcomes — that is real information ("possible but most
  stall"), not a bug; copy for co-presence covered in tests.

## 5. Testing plan

- Unit tests per §3.6; `npx tsc --noEmit`; full vitest; build.
- Live validation (Keepa tokens only): provider-level run on the same 7
  probed niches (consistency: creatine gummies → welcoming, berberine →
  contested, magnesium glycinate + turmeric →
  no_small_entrants_visible, sleep gummies → insufficient/nothing)
  PLUS — critique fix (round 2): at least 2 FRESH niches that played no
  part in deriving the constants, to break the circularity of
  validating against the design set. Record row copy renders per state;
  truth-audit passes.

## 5b. Live validation results (2026-08-04, executed)

6 niches, real Keepa, full pipeline (fetch → detection → display row):
- creatine gummies → welcoming, "9 of 9 ... selling past ~200/mo" ✓
- magnesium glycinate → no_small_entrants_visible, "(6) already carries a
  1,000+ review base" ✓
- sleep gummies → insufficient, no row ✓
- FRESH probiotics for women → null (no young cohort visible at all in a
  mature niche), no row — honest ✓
- FRESH electrolyte powder → insufficient (2 judgeable < 4), no row ✓
- berberine gummies → welcoming (7 of 10 past ~125/mo; 3 stalled = 30%,
  under the 34% contested bar) — DEVIATES from §0's "contested"
  expectation, and the deviation is CORRECT: the §0 probe counted brand
  duplicates (DIAOLAI/NEVISS/MEENCCD each listed twice); the production
  path runs dedupeByBrand first, which removes double-counted stalls.
  The design-table numbers were pre-dedupe; production's are the honest
  ones. Borderline-threshold sensitivity (30% vs 34%) is inherent to any
  bar and the displayed "7 of 10" carries the nuance either way.

## 6. Smallest-correct-scope

One pure function + 5 disclosed constants, one provider call, one
additive signal field, one state-dependent Competition row + one
appendix caveat line, one audit check, tests. No scoring, no new
fetches, no UI components.

## 7. Non-goals

- **No scoring impact** — the external-research verdict (no failure
  base rates exist; badge has confirmed false negatives) makes any
  malus/bonus indefensible today. Revisit only with real outcome data
  (M3.2) or the seller-survey calibration.
- **No claim to see actual failures** — the invisible graveyard stays
  invisible; every claim is scoped to the visible cohort and phrased as
  a floor.
- **No per-listing sponsored-ad detection** (no data source).
- **No sales-history trajectory analysis** (monthlySoldHistory decay
  curves — a possible future deepening, real added complexity).
- **No backfill** — new analyses only, same as Entry Proof.
