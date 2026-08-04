// ── Measured competitor economics — item ב (docs/RD_V4_NICHE_COMPETITOR_ECONOMICS.md)
//
// Pure helpers, no I/O: turn the query-specific /search products the Keepa
// provider ALREADY fetches (and previously discarded the monthlySold of)
// into a per-competitor revenue table plus honest aggregates. The three
// integrity guards here are exactly the three traps the 2026-07-27 live
// probe exposed:
//   1. filterToDominantCategory — Amazon search mixes product classes
//      (real case: Midol/Pamprin OTC caplets passing word-overlap relevance
//      for "Period Bloating Relief"); a founder can't legally compete with
//      an OTC monograph drug, so minority-category results are excluded and
//      COUNTED, never silently dropped.
//   2. dedupeByBrand — the same brand's size variants (real case: The
//      Missing Link 1lb + 5lb bags) must not count as two competitors.
//   3. Callers must present every figure as a floor: monthlySold is
//      Amazon's rounded-DOWN "bought in past month" band (20000, 3000,
//      300…), so price × monthlySold is a lower bound, not an exact read.
//      This module only does the arithmetic; the ~/floor presentation rule
//      lives with the UI (see EvidenceAppendix).

export interface MeasuredCompetitorInput {
  productId:        string
  brand:            string          // '' when the listing has no brand field
  price:            number | null   // dollars, extracted by the provider (fba → buybox → amazon avg90)
  monthlySold:      number | null   // Amazon's rounded-down band; null when the badge is absent
  categoryLevel1Id: number | null   // categoryTree[1].catId; null when the tree is missing/shallow
  // Entry Proof (docs/RD_ENTRY_PROOF.md): real per-ASIN COUNT_REVIEWS and
  // listedSince-derived age — already fetched (rating=1/stats=365), formerly
  // discarded here. null = the stats slot was absent; 0 is a real observed
  // zero (a brand-new listing), never conflated with missing.
  reviewCount:      number | null
  listingAgeMonths: number | null
  // Wounded Leader / Amazon Presence (docs/RD_WOUNDED_LEADER_AMAZON_PRESENCE.md):
  // historical stats already fetched (stats=365&rating=1), formerly unread.
  // priceAvg365 comes from the SAME price slot the avg90 chain picked
  // (critique fix: mixing slots compares different price types). Ratings are
  // decimal stars (4.7). null = slot absent, never fabricated.
  ratingCurrent:    number | null
  ratingAvg365:     number | null
  priceAvg365:      number | null
  buyBoxIsAmazon:   boolean | null
}

export interface CompetitorRevenueRow {
  productId:              string
  brand:                  string
  price:                  number
  monthly_sold:           number
  est_monthly_revenue_mo: number    // price × monthly_sold — a floor (see header)
  // Entry Proof (docs/RD_ENTRY_PROOF.md): carried on EVERY row so the
  // appendix table always shows the full review-count continuum — the
  // headline logic below only ever chooses emphasis, never visibility.
  review_count:           number | null
  listing_age_months:     number | null
  rating_current:         number | null
  rating_avg365:          number | null
  price_avg365:           number | null
}

export interface CompetitorRevenueTable {
  rows:                        CompetitorRevenueRow[]   // sorted by revenue desc
  measured_revenue_total_mo:   number
  revenue_concentration_top1:  number                   // 0–1, leader ÷ total
  off_category_excluded_count: number
}

// Guard 1. Majority vote on the second-level category id among products
// that HAVE one; products from minority categories are excluded (returned
// as a count for disclosure). Products with a null id are KEPT — a missing
// category tree is absence of data, not evidence the product is
// off-category; the real contamination case (OTC drugs) carries a real,
// different tree. Ties keep every tied category (conservative: when the
// data can't pick a winner, nothing is excluded on a coin flip).
export function filterToDominantCategory<T extends { categoryLevel1Id: number | null }>(
  products: T[],
): { kept: T[]; excludedCount: number } {
  const counts = new Map<number, number>()
  for (const p of products) {
    if (p.categoryLevel1Id !== null) counts.set(p.categoryLevel1Id, (counts.get(p.categoryLevel1Id) ?? 0) + 1)
  }
  if (counts.size <= 1) return { kept: products, excludedCount: 0 }

  const maxCount = Math.max(...Array.from(counts.values()))
  const dominant = new Set(Array.from(counts.entries()).filter(([, c]) => c === maxCount).map(([id]) => id))
  const kept = products.filter(p => p.categoryLevel1Id === null || dominant.has(p.categoryLevel1Id))
  return { kept, excludedCount: products.length - kept.length }
}

// Guard 2. One entry per brand, keeping the highest-monthlySold listing
// (the size variant actually selling most). Brandless listings are keyed
// by their own productId so they never collapse into each other.
export function dedupeByBrand<T extends { productId: string; brand: string; monthlySold: number | null }>(
  products: T[],
): T[] {
  const byKey = new Map<string, T>()
  for (const p of products) {
    const key = p.brand.trim().toLowerCase() || `__no_brand__${p.productId}`
    const existing = byKey.get(key)
    if (!existing || (p.monthlySold ?? -1) > (existing.monthlySold ?? -1)) byKey.set(key, p)
  }
  return Array.from(byKey.values())
}

// Composition: guard 1 → guard 2 → rows from products measured on BOTH
// axes (real price AND real monthlySold) → aggregates. Returns null below
// 2 measured rows: a one-product "table" is exactly the n=1 misleading
// average the round-1 critique caught — absence over fabrication.
export function buildCompetitorRevenueTable(products: MeasuredCompetitorInput[]): CompetitorRevenueTable | null {
  const { kept, excludedCount } = filterToDominantCategory(products)
  const deduped = dedupeByBrand(kept)

  const rows: CompetitorRevenueRow[] = deduped
    .filter((p): p is MeasuredCompetitorInput & { price: number; monthlySold: number } =>
      p.price !== null && p.price > 0 && p.monthlySold !== null && p.monthlySold > 0)
    .map(p => ({
      productId:              p.productId,
      brand:                  p.brand || '(no brand listed)',
      price:                  p.price,
      monthly_sold:           p.monthlySold,
      est_monthly_revenue_mo: Math.round(p.price * p.monthlySold),
      review_count:           p.reviewCount,
      listing_age_months:     p.listingAgeMonths,
      rating_current:         p.ratingCurrent,
      rating_avg365:          p.ratingAvg365,
      price_avg365:           p.priceAvg365,
    }))
    .sort((a, b) => b.est_monthly_revenue_mo - a.est_monthly_revenue_mo)

  if (rows.length < 2) return null

  const total = rows.reduce((sum, r) => sum + r.est_monthly_revenue_mo, 0)
  return {
    rows,
    measured_revenue_total_mo:   total,
    revenue_concentration_top1:  Math.round((rows[0].est_monthly_revenue_mo / total) * 100) / 100,
    off_category_excluded_count: excludedCount,
  }
}

// ── Entry Proof — docs/RD_ENTRY_PROOF.md ─────────────────────────────────────
//
// Owner criterion (2026-08-02): a seller with FEW reviews moving a NICE
// monthly volume is direct, measured evidence the niche is penetrable
// without a review moat. Design constraints from the owner + the
// adversarial critique round:
//   - Niche-relative and cliff-free: no absolute thresholds anywhere; the
//     constants below choose which example gets the Record HEADLINE row —
//     they never exclude a product from the appendix table, which always
//     shows every row's real review count.
//   - Volume floor is relative (≥ half the niche median sold) so a
//     60-units/mo seller in a huge niche can't headline on ratio alone.
//   - A low-review listing from a brand that has ANOTHER ≥1000-review
//     product in this same analysis's fetched data is an established
//     brand's line extension (brand equity + ad budget), not proof a new
//     company can enter — skipped as headline, kept in the table. Best
//     effort: we can only see brands inside our own fetched sets.
//   - Deep-discount volume (price < 60% of niche median) is disclosed on
//     the headline, never hidden and never silently excluded.
// All four constants are disclosed initial values, same convention as
// VELOCITY_THRESHOLD_PCT — not calibrated (no outcome data yet, M3.2).

export const ENTRY_PROOF_MIN_DISPROPORTION      = 2     // sales-share ÷ review-share — required of EVERY member (critique 2026-08-03: without it, "below median reviews" is a relative tautology that fires on 4k-review sellers in a 5k-median mature niche)
// Owner ladder design 2026-08-03: ONE member bar (¼ median), not the earlier
// ½-median headline bar — two different volume bars would create members that
// can't be shown alone (an incoherent tier boundary). The ladder wording
// (1 → 2 → 3+ members) carries the strength signal instead; every member's
// real numbers are displayed, so a modest-volume singleton reads as exactly
// what it is.
export const ENTRY_PROOF_MIN_MEDIAN_SOLD_RATIO  = 0.25  // member sold ≥ quarter of niche median
export const ENTRY_PROOF_ESTABLISHED_REVIEW_BASE = 1000 // same-brand other-product review base
export const ENTRY_PROOF_PRICE_DUMP_RATIO       = 0.6   // price < 60% of median → disclose
export const ENTRY_PROOF_RECENT_MONTHS          = 24    // v2: REQUIRED for membership (see below)
export const ENTRY_PROOF_PATTERN_COUNT          = 3     // members needed for the strongest ("pattern") wording
// v2 bar (deep-research round, 2026-08-03): a 7-niche live Keepa sample
// showed the v1 relative-only bar fired in 7/7 niches, and in mature niches
// its "members" were mega-brands — Nature's Bounty at 5,787 reviews (below a
// 6,957 median), Amazon Basics, NOW Foods. "Below median" alone admits
// giants wherever the median is high, which is exactly the near-zero-
// discriminating-power failure that got Manufacturing Feasibility removed
// from scoring. v2 therefore ALSO requires genuinely-few reviews in the
// absolute sense a new company could plausibly reach quickly. Sensitivity
// checked on the sample: anchors 200-300 keep every genuine entrant
// (94/86/66 reviews) and exclude every giant; 300 chosen, disclosed,
// uncalibrated — first constant to calibrate once real outcomes exist.
// KNOWN residual false positive (disclosed, unfixed): a mega-brand's NEW
// low-review listing (e.g. a giant 6 months in at 250 reviews) passes —
// the established-brand check only sees the ~25 products this analysis
// fetched. This is priced into the deliberately modest scoring bonus
// (lib/scoring.ts); a curated big-brand data file is the future option.
export const ENTRY_PROOF_ABS_REVIEW_ANCHOR      = 300   // member reviews ≤ min(median, this)
// Version stamp written onto entry_proof so the scoring bonus
// (lib/scoring.ts, SCORING_ENGINE_VERSION 2.12.0) can refuse to score
// rows produced by the weaker v1 bar — scores are recomputed from stored
// memos at read time, so without this stamp the bonus would retroactively
// reward v1's Nature's-Bounty-grade "members".
export const ENTRY_PROOF_CRITERIA_VERSION       = 2

// One fetched product's brand + review base, PRE-dedupe — the established-
// brand check needs sibling listings that dedupeByBrand already collapsed.
export interface BrandReviewBase {
  productId:   string
  brand:       string
  reviewCount: number
}

// One qualifying member of the entry-proof ladder — every field is a real
// Keepa observation; a member passes ALL the emphasis tests (below-median
// reviews, disproportion, volume floor, not an established brand's line
// extension), price-dumping is flagged rather than excluded.
export interface EntryProofMember {
  productId:            string
  brand:                string
  monthly_sold:         number   // floor (rounded-down band)
  review_count:         number
  price:                number
  listing_age_months?:  number
  recent?:              boolean  // listing_age_months ≤ ENTRY_PROOF_RECENT_MONTHS
  price_dump_suspected?: boolean
}

// Ladder result (owner design 2026-08-03): the flat top-level fields are the
// STRONGEST member (kept flat for back-compat with entry_proof rows stored
// before the ladder existed); `members` ranks every qualifying seller,
// strongest first — display wording scales with members.length (1 example /
// 2 independent examples / ≥ENTRY_PROOF_PATTERN_COUNT = "pattern"), so a
// rigorous bar never pressures anyone to loosen it just to "reach 3".
export interface EntryProofHeadline extends EntryProofMember {
  // Niche context — real medians over the measured rows, so the display
  // can state "only 45 reviews (typical here: 1,200)" honestly.
  niche_median_reviews: number
  niche_median_sold:    number
  niche_median_price:   number
  members?:             EntryProofMember[]
  // ENTRY_PROOF_CRITERIA_VERSION at detection time — scoring only trusts ≥2.
  criteria_version?:    number
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Pure. rows = buildCompetitorRevenueTable().rows (already category-filtered
// and brand-deduped); fetchedBrandBases = every fetched product pre-dedupe.
// Returns the ladder (strongest member flat + full ranked member list), or
// null when no row earns emphasis — absence over a weak, misleading "proof".
export function detectEntryProof(
  rows: CompetitorRevenueRow[],
  fetchedBrandBases: BrandReviewBase[],
): EntryProofHeadline | null {
  const eligible = rows.filter(
    (r): r is CompetitorRevenueRow & { review_count: number } =>
      r.review_count !== null && r.monthly_sold > 0,
  )
  if (eligible.length < 2) return null   // shares/medians need ≥2 measured rows

  const totalSold    = eligible.reduce((s, r) => s + r.monthly_sold, 0)
  // Reviews floored at 1 in the share denominator so a real 0-review row
  // (brand-new listing) doesn't divide by zero — the raw 0 stays displayed.
  const totalReviews = eligible.reduce((s, r) => s + Math.max(r.review_count, 1), 0)
  const medianReviews = median(eligible.map(r => r.review_count))
  const medianSold    = median(eligible.map(r => r.monthly_sold))
  const medianPrice   = median(eligible.map(r => r.price))

  const disproportion = (r: CompetitorRevenueRow & { review_count: number }) =>
    (r.monthly_sold / totalSold) / (Math.max(r.review_count, 1) / totalReviews)

  const ranked = [...eligible].sort((a, b) => disproportion(b) - disproportion(a))

  const members: EntryProofMember[] = []
  for (const r of ranked) {
    if (r.review_count >= medianReviews) continue
    // v2: genuinely-few reviews in the absolute sense too — "below median"
    // alone admits 5,787-review giants wherever the median is higher (real
    // sampled case: Nature's Bounty under a 6,957 median).
    if (r.review_count > ENTRY_PROOF_ABS_REVIEW_ANCHOR) continue
    // v2: recency is REQUIRED, not corroboration — the claim is "a NEW
    // company entered", and a null/old listing age can't support it.
    // Deliberately conservative on missing data: an age-less row loses
    // membership (emphasis + scoring), never its place in the table —
    // demanding complete evidence for a strong claim, disclosed here.
    if (r.listing_age_months === null || r.listing_age_months > ENTRY_PROOF_RECENT_MONTHS) continue
    if (disproportion(r) < ENTRY_PROOF_MIN_DISPROPORTION) continue
    if (r.monthly_sold < medianSold * ENTRY_PROOF_MIN_MEDIAN_SOLD_RATIO) continue
    const brandKey = r.brand.trim().toLowerCase()
    const established = brandKey !== '' && fetchedBrandBases.some(b =>
      b.productId !== r.productId &&
      b.brand.trim().toLowerCase() === brandKey &&
      b.reviewCount >= ENTRY_PROOF_ESTABLISHED_REVIEW_BASE)
    if (established) continue

    const dumped = r.price < medianPrice * ENTRY_PROOF_PRICE_DUMP_RATIO
    members.push({
      productId:            r.productId,
      brand:                r.brand,
      monthly_sold:         r.monthly_sold,
      review_count:         r.review_count,
      price:                r.price,
      listing_age_months:   r.listing_age_months,
      recent:               true,   // by construction in v2 — kept for shape stability with stored v1 rows
      ...(dumped && { price_dump_suspected: true }),
    })
  }
  if (members.length === 0) return null

  return {
    ...members[0],
    niche_median_reviews: Math.round(medianReviews),
    niche_median_sold:    Math.round(medianSold),
    niche_median_price:   Math.round(medianPrice),
    members,
    criteria_version:     ENTRY_PROOF_CRITERIA_VERSION,
  }
}

// ── Entry Outcomes — docs/RD_ENTRY_OUTCOMES.md ──────────────────────────────
//
// What happened to the VISIBLE young cohort (né "Graveyard" — renamed by the
// evidence). The original idea (count young no-badge listings as failures)
// was killed by a live 7-niche probe: failing listings essentially never
// appear in top-20 search (1 of 42 young listings lacked a badge, and it was
// 0 months old). What DOES discriminate is the fate of the visible young
// cohort — see the R&D doc's 4-state taxonomy. Everything here is scoped to
// what is visible; the invisible graveyard stays invisible and the display
// layer carries that caveat (appendix footnote).
//
// Two critique-round rules baked in:
//   - NO brand-identity claims: our data cannot distinguish a mega-brand's
//     young listing from a successful independent entrant (real probe case:
//     Inner Brightness, 11mo, 1,838 reviews). `large_base` is an observation
//     about review scale only, and copy must phrase it that way.
//   - Dual-anchored stall bar (the lesson Entry Proof taught twice): an
//     absolute-only bar would call a near-median seller "stalled" in a
//     low-volume niche.
// All constants disclosed, uncalibrated (no failure base rates exist
// anywhere — the external-research verdict; this signal is display-only).

export const OUTCOMES_MIN_JUDGE_AGE_MONTHS   = 6     // younger than this = too early to judge (launch-window folklore clusters 1-6mo; judgment call)
export const OUTCOMES_STALL_MAX_SOLD         = 200   // absolute anchor — a real Amazon badge band
export const OUTCOMES_STALL_MEDIAN_RATIO     = 0.25  // relative anchor — stall bar = min(200, ¼ × niche median sold)
export const OUTCOMES_MIN_COHORT             = 4     // fewer judgeable listings than this = no claim (absence over weak claims)
export const OUTCOMES_CONTESTED_STALL_SHARE  = 0.34  // stalled share at/above this = contested
export const OUTCOMES_MIN_YOUNG_FOR_VISIBILITY_STATE = 3  // young cohort needed before "no small entrants visible" is claimable

export interface EntryOutcomeMember {
  productId:          string
  brand:              string
  monthly_sold:       number | null   // null = Amazon's badge absent (likely under ~50/mo; badge is a ~90%-accurate pilot, never "provably zero")
  review_count:       number | null
  listing_age_months: number
  price:              number | null
}

export interface EntryOutcomes {
  state: 'welcoming' | 'contested' | 'no_small_entrants_visible' | 'insufficient'
  young_total:          number   // visible young (≤24mo, known age) after guards
  large_base_count:     number   // young listings with a ≥1000-review scale (own or same-brand elsewhere in fetched data)
  small_scale_count:    number
  judgeable_count:      number   // small-scale AND old enough to judge (≥6mo)
  broke_out:            EntryOutcomeMember[]
  stalled:              EntryOutcomeMember[]
  stall_threshold_sold: number   // the actual bar used — display must state it, not the constant
}

// Pure. inputs = the RAW measuredCompetitorInputs (pre both-axes filter —
// the whole point is seeing listings the revenue table drops);
// fetchedBrandBases = every fetched product pre-dedupe (same array Entry
// Proof uses). Returns null when no young cohort is visible at all.
export function computeEntryOutcomes(
  inputs: MeasuredCompetitorInput[],
  fetchedBrandBases: BrandReviewBase[],
): EntryOutcomes | null {
  const { kept } = filterToDominantCategory(inputs)
  const deduped = dedupeByBrand(kept)

  const young = deduped.filter(
    (p): p is MeasuredCompetitorInput & { listingAgeMonths: number } =>
      p.listingAgeMonths !== null && p.listingAgeMonths <= ENTRY_PROOF_RECENT_MONTHS,
  )
  if (young.length === 0) return null

  const hasLargeBase = (p: MeasuredCompetitorInput) => {
    if ((p.reviewCount ?? 0) >= ENTRY_PROOF_ESTABLISHED_REVIEW_BASE) return true
    const brandKey = p.brand.trim().toLowerCase()
    return brandKey !== '' && fetchedBrandBases.some(b =>
      b.productId !== p.productId &&
      b.brand.trim().toLowerCase() === brandKey &&
      b.reviewCount >= ENTRY_PROOF_ESTABLISHED_REVIEW_BASE)
  }
  const largeBase  = young.filter(hasLargeBase)
  const smallScale = young.filter(p => !hasLargeBase(p))
  const judgeable  = smallScale.filter(p => p.listingAgeMonths! >= OUTCOMES_MIN_JUDGE_AGE_MONTHS)

  // Dual-anchored stall bar; median over the deduped measured (badge-bearing)
  // set — the same numbers the revenue table is built from.
  const soldValues = deduped
    .map(p => p.monthlySold)
    .filter((s): s is number => s !== null && s > 0)
    .sort((a, b) => a - b)
  const medianSold = soldValues.length >= 2
    ? (soldValues.length % 2
        ? soldValues[Math.floor(soldValues.length / 2)]
        : (soldValues[soldValues.length / 2 - 1] + soldValues[soldValues.length / 2]) / 2)
    : null
  const stallBar = medianSold !== null
    ? Math.min(OUTCOMES_STALL_MAX_SOLD, Math.round(medianSold * OUTCOMES_STALL_MEDIAN_RATIO))
    : OUTCOMES_STALL_MAX_SOLD

  const toMember = (p: MeasuredCompetitorInput): EntryOutcomeMember => ({
    productId:          p.productId,
    brand:              p.brand || '(no brand listed)',
    monthly_sold:       p.monthlySold,
    review_count:       p.reviewCount,
    listing_age_months: p.listingAgeMonths!,
    price:              p.price,
  })
  const stalled  = judgeable.filter(p => p.monthlySold === null || p.monthlySold <= stallBar).map(toMember)
  const brokeOut = judgeable.filter(p => p.monthlySold !== null && p.monthlySold > stallBar).map(toMember)

  const state: EntryOutcomes['state'] =
    young.length >= OUTCOMES_MIN_YOUNG_FOR_VISIBILITY_STATE && smallScale.length === 0
      ? 'no_small_entrants_visible' :
    judgeable.length < OUTCOMES_MIN_COHORT
      ? 'insufficient' :
    stalled.length / judgeable.length >= OUTCOMES_CONTESTED_STALL_SHARE
      ? 'contested'
      : 'welcoming'

  return {
    state,
    young_total:          young.length,
    large_base_count:     largeBase.length,
    small_scale_count:    smallScale.length,
    judgeable_count:      judgeable.length,
    broke_out:            brokeOut,
    stalled,
    stall_threshold_sold: stallBar,
  }
}

// ── Wounded Leader — docs/RD_WOUNDED_LEADER_AMAZON_PRESENCE.md ──────────────
//
// Practitioner heuristic: attack when the king is weak. Single-leader signal
// (top_competitor_revenues[0], the guarded revenue leader — deliberately NOT
// biggest_competitor, a different definition). Three wounds, each rendered
// with its real numbers, display-only. Every threshold is a disclosed
// judgment call — the external research (Floyd et al. 2014 meta-analysis)
// confirms rating→sales causality is real but found NO source-grounded
// cutoff anywhere; vendor numbers (Pattern.com etc.) have no public
// methodology. Review-velocity wound deliberately ABSENT in v1: live probe
// caught Amazon review purges / variation splits producing −26k swings that
// a naive velocity metric would misread as demand collapse.

export const WOUND_RATING_DRIFT     = 0.2   // current at least this far below own 365-day avg
export const WOUND_RATING_GAP       = 0.3   // at least this far below the peers' median rating
export const WOUND_MIN_RATED_PEERS  = 4     // critique fix: a 2-3-row median can't indict a leader
export const WOUND_PRICE_CLIMB_PCT  = 0.10  // price at least this far above own 365-day avg (same slot)

export interface LeaderWound {
  type: 'rating_slide' | 'rating_gap' | 'price_climb'
  // The real numbers behind the wound — display renders these, never the
  // constants.
  now:      number
  baseline: number   // own 365-day avg (slide/climb) or peers' median (gap)
}

export interface WoundedLeader {
  productId: string
  brand:     string
  wounds:    LeaderWound[]   // ≥1 by construction (null returned otherwise)
}

// Pure. rows = buildCompetitorRevenueTable().rows (revenue-sorted, guarded).
// Each wound skips null-safe when its inputs are absent — silence can mean
// "healthy" OR "no data"; the display makes no health claim on silence.
export function detectWoundedLeader(rows: CompetitorRevenueRow[]): WoundedLeader | null {
  const leader = rows[0]
  if (!leader) return null
  const wounds: LeaderWound[] = []

  if (leader.rating_current !== null && leader.rating_avg365 !== null &&
      leader.rating_avg365 - leader.rating_current >= WOUND_RATING_DRIFT) {
    wounds.push({ type: 'rating_slide', now: leader.rating_current, baseline: leader.rating_avg365 })
  }

  const peerRatings = rows.slice(1)
    .map(r => r.rating_current)
    .filter((r): r is number => r !== null)
    .sort((a, b) => a - b)
  if (leader.rating_current !== null && peerRatings.length >= WOUND_MIN_RATED_PEERS) {
    const mid = Math.floor(peerRatings.length / 2)
    const peerMedian = peerRatings.length % 2 ? peerRatings[mid] : (peerRatings[mid - 1] + peerRatings[mid]) / 2
    if (peerMedian - leader.rating_current >= WOUND_RATING_GAP) {
      wounds.push({ type: 'rating_gap', now: leader.rating_current, baseline: Math.round(peerMedian * 10) / 10 })
    }
  }

  if (leader.price_avg365 !== null && leader.price_avg365 > 0 &&
      leader.price >= leader.price_avg365 * (1 + WOUND_PRICE_CLIMB_PCT)) {
    wounds.push({ type: 'price_climb', now: leader.price, baseline: leader.price_avg365 })
  }

  if (wounds.length === 0) return null
  return { productId: leader.productId, brand: leader.brand, wounds }
}

// ── Amazon First-Party Presence — same R&D doc ──────────────────────────────
//
// Two DISTINCT facts, never conflated (critique fix): (1) an Amazon HOUSE
// BRAND sells in this niche (curated-list brand match, lib/signal-engine/
// amazon-brands.ts); (2) Amazon is the RETAILER (1P buybox) for some top
// listings — vendor-supplied brands, i.e. Amazon's retail power here, NOT
// Amazon competing with its own product. Display states facts with real
// numbers; the "should you enter" conclusion is explicitly not made — the
// research verdict is that the seller veto is half-folklore (documented
// self-preferencing, but house brands ≈1% of Amazon sales overall).

export interface AmazonPresence {
  house_brands: { productId: string; brand: string; monthly_sold: number | null }[]
  // 1P-buybox share was designed in and REMOVED by live validation
  // (2026-08-04): without the buybox=1 request param Keepa populates
  // buyBoxIsAmazon for only 1-4 of ~15 rows — and ~100% of those were
  // Amazon in every probed niche, a biased denominator that would have
  // rendered "Amazon holds the buybox on all known listings" everywhere.
  // Reliable 1P share needs buybox=1 (real token cost) — future work.
}

// matchBrand injected (the curated matcher from amazon-brands.ts) so this
// module stays pure data-in/data-out with no cross-file data dependency.
export function detectAmazonPresence(
  inputs: MeasuredCompetitorInput[],
  matchBrand: (brand: string) => string | null,
): AmazonPresence | null {
  const { kept } = filterToDominantCategory(inputs)
  const deduped = dedupeByBrand(kept)

  const house = deduped
    .filter(p => matchBrand(p.brand) !== null)
    .map(p => ({ productId: p.productId, brand: p.brand, monthly_sold: p.monthlySold }))
    .sort((a, b) => (b.monthly_sold ?? 0) - (a.monthly_sold ?? 0))

  if (house.length === 0) return null
  return { house_brands: house }
}
