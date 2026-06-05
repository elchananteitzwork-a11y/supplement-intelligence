# V3 SCORING ENGINE — SPECIFICATION
**Version:** 3.0.0
**Last Updated:** 2026-06-04

---

## Final Opportunity Score Formula

```
Final Opportunity Score (0–100) =
    demand_score            × 0.25
  + new_seller_score        × 0.20
  + listing_weakness_score  × 0.15
  + trend_velocity_score    × 0.15
  + market_saturation_score × 0.10
  + brand_expansion_score   × 0.10
  + review_integrity_score  × 0.05
  ────────────────────────────────
  weights sum               = 1.00
```

Each component scores **0–100** independently.
The final score is the weighted sum of all 7 components.

---

## Component 1 — DEMAND SCORE (25%)

**Question answered:** Is there proven, consistent, growing demand for this product?

**Data source:** Keepa (BSR history, price history, calibrated sales estimate)

### Sub-factors (total = 100 pts)

#### Monthly Sales Estimate — 40 pts
Uses `calibrated_monthly_sales()` with per-category velocity factor.

| Calibrated Sales/mo | Points |
|----|-----|
| ≥ 1,000 | 40 |
| ≥ 500 | 32 |
| ≥ 300 | 24 |
| ≥ 200 | 16 |
| ≥ 100 | 8 |
| ≥ 50 | 4 |
| < 50 | 0 |

#### BSR Trend × Velocity — 25 pts
Combined signal from `BSRAnalysis.trend_direction` × `BSRAnalysis.demand_velocity`.

| Trend | Velocity | Points |
|---|---|---|
| Improving | Accelerating | 25 |
| Improving | Stable | 20 |
| Improving | Decelerating | 16 |
| Improving | Unknown | 18 |
| Stable | Accelerating | 15 |
| Stable | Stable | 12 |
| Stable | Decelerating | 8 |
| Stable | Unknown | 10 |
| Declining | any | 0–5 |

#### Demand Consistency — 20 pts
Inverse of BSR volatility. Low volatility = reliable, predictable demand.

| BSR Volatility | Points |
|---|---|
| Low | 20 |
| Medium | 12 |
| High | 5 |
| Unknown | 10 |

#### Price Stability — 15 pts
From `PriceAnalysis.price_trend` (90-day price direction).

| Price Trend | Points | Rationale |
|---|---|---|
| Rising | 15 | Pricing power — market supports premium |
| Stable | 12 | Predictable margins |
| Declining | 3 | Margin erosion risk |
| Insufficient | 7 | Neutral |

---

## Component 2 — NEW SELLER SUCCESS SCORE (20%)

**Question answered:** Are new, unfunded sellers actually succeeding in this market right now?

**Data source:** Keepa (review count history, BSR analysis)

### Sub-factors (total = 100 pts)

#### Low-Review Winners — 40 pts
Count of products in the scan with `avg_bsr_90d < 3,000` AND `review_count < 100`.
BSR < 3,000 ≈ 1,200+ units/mo (Kitchen calibration). Proves new sellers reach real volume.

| Winners Found | Points |
|---|---|
| ≥ 4 | 40 |
| 3 | 30 |
| 2 | 20 |
| 1 | 10 |
| 0 | 0 |

#### Review Velocity of New Sellers — 30 pts
Average review velocity (reviews/month) for products with < 100 reviews.
High velocity = Amazon algorithm is rewarding new listings.

| Avg Velocity/mo | Points |
|---|---|
| ≥ 30 | 30 |
| ≥ 20 | 24 |
| ≥ 10 | 18 |
| ≥ 5 | 12 |
| > 0 | 6 |
| No data | 0 |

#### Review-to-Revenue Efficiency — 20 pts
Best R2R efficiency seen in scan: monthly revenue ÷ review count.
High = market rewards new listings before they have social proof built.

| Best R2R ($/review) | Points |
|---|---|
| ≥ $500 | 20 |
| ≥ $200 | 16 |
| ≥ $100 | 12 |
| ≥ $50 | 8 |
| > $0 | 4 |
| No data | 0 |

#### Per-Product Bonus — 10 pts
Added to market-level score based on this specific product's credentials.

| Condition | Bonus |
|---|---|
| `avg_bsr_90d < 3,000` AND `review_count < 100` | +10 |
| `avg_bsr_90d < 5,000` AND `review_count < 200` | +5 |
| Otherwise | 0 |

---

## Component 3 — LISTING WEAKNESS SCORE (15%)

**Question answered:** How weak are competitor listings? Can we build something better?

**Data source:** Keepa (ratings), brand name heuristics; listing scraper = STUB

A higher score means weaker competitor listings = more opportunity to win with a better listing.

### Sub-factors (total = 100 pts)

#### Rating Gap Signal — 40 pts
Uses scan-pool average rating and individual product rating.
Low average rating = significant complaint volume = listing/product improvement opportunity.

| Avg Rating (lower bound of product vs market avg) | Points |
|---|---|
| < 3.8 | 40 |
| < 4.0 | 30 |
| < 4.2 | 20 |
| < 4.4 | 12 |
| ≥ 4.4 | 5 |
| No data | 18 (neutral) |

#### Brand Weakness Signal — 30 pts
Percentage of scanned products with unknown/unrecognized brand names.
Unknown brands correlate with thin listings (no brand consistency, weak visual identity).

| Unknown Brand % in Pool | Points |
|---|---|
| ≥ 60% | 30 |
| ≥ 40% | 24 |
| ≥ 20% | 16 |
| > 0% | 8 |
| 0% (all known brands) | 5 |

#### Listing Completeness — 30 pts ⚠️ STUB
Future: scrape listing for image count, A+ content, video presence, title quality.
Current default: **15 pts (neutral 50%)** pending listing scraper integration.

---

## Component 4 — TREND VELOCITY SCORE (15%)

**Question answered:** Is demand for this product growing on social/search before Amazon fully reflects it?

**Data source:** External adapters — currently all STUBS. Returns neutral score of 50.

### Source Weights (when all live)

| Source | Weight | Signal Type |
|---|---|---|
| Google Trends | 40% | 12-month search interest normalized to 0–100 |
| TikTok | 35% | Hashtag volume + video engagement |
| Reddit | 15% | Post + comment volume on product keywords |
| Pinterest | 10% | Monthly save count for product-adjacent terms |

### Current behavior
All 4 sources are stubs (`is_available = False`).
When no sources are available, `trend_velocity_score = 50` (neutral — no penalty, no bonus).

When a live source is added and `is_available = True`, it automatically joins the
weighted average. Sources returning `None` are excluded from the average.

**To enable a source:** implement `TrendDataSource` protocol and pass to `v3.engine.run()`.

---

## Component 5 — MARKET SATURATION SCORE (10%)

**Question answered:** How open is this market to a new entrant?

A **higher** score = **less** saturated = better opportunity.

**Data source:** Keepa (offer_count, buy box history, price history, brand names)

### Sub-factors (total = 100 pts)

#### Seller Count — 25 pts
Uses individual product `offer_count` from Keepa. Fewer sellers = less competition.

| Avg Offer Count | Points |
|---|---|
| ≤ 2 | 25 |
| ≤ 5 | 20 |
| ≤ 10 | 14 |
| ≤ 20 | 8 |
| > 20 | 3 |
| No data | 12 (neutral) |

#### Brand Concentration — 25 pts
Unique brand count ÷ total product count in scan pool.
High ratio = fragmented market = no dominant brand = more opportunity.

| Unique Brand Ratio | Points |
|---|---|
| ≥ 0.8 | 25 |
| ≥ 0.6 | 20 |
| ≥ 0.4 | 14 |
| ≥ 0.2 | 8 |
| < 0.2 | 3 |

#### Amazon Presence — 25 pts
`PriceAnalysis.amazon_holds_buybox_pct`. High Amazon presence = hard to compete.

| Amazon Buy Box % | Points |
|---|---|
| < 10% | 25 |
| < 30% | 20 |
| < 50% | 13 |
| < 70% | 6 |
| ≥ 70% | 0 |
| No data | 13 (neutral) |

#### Price Spread — 25 pts
`PriceAnalysis.price_band_usd`. Wide price spread = healthy differentiation opportunity.

| Price Band (USD) | Points |
|---|---|
| ≥ $20 | 25 |
| ≥ $10 | 20 |
| ≥ $5 | 14 |
| ≥ $2 | 8 |
| < $2 (compressed) | 3 |
| No data | 13 (neutral) |

---

## Component 6 — BRAND EXPANSION SCORE (10%)

**Question answered:** Can this product become a multi-product brand, not just a single SKU?

**Data source:** Keepa aggregates + `CategoryConfig.expansion_potential`

### Sub-factors (total = 100 pts)

#### Price Tier — 25 pts
Higher average price → more margin → more budget for brand investment.

| Category Avg Price | Points |
|---|---|
| ≥ $40 | 25 |
| ≥ $30 | 20 |
| ≥ $20 | 14 |
| ≥ $15 | 8 |
| < $15 | 4 |
| No data | 12 |

#### Evergreen Demand — 25 pts
% of products in scan pool marked seasonal by BSR analysis.
Evergreen = reliable recurring revenue = brand-buildable.

| Seasonal Product % | Points |
|---|---|
| < 20% | 25 |
| < 40% | 18 |
| < 60% | 10 |
| ≥ 60% | 5 |

#### Market Size Signal — 25 pts
Median calibrated monthly sales across all scanned products.
Larger market = more room for brand to grow.

| Median Sales/mo | Points |
|---|---|
| ≥ 500 | 25 |
| ≥ 300 | 20 |
| ≥ 150 | 14 |
| ≥ 75 | 8 |
| < 75 | 4 |
| No data | 12 |

#### Category Expansion Potential — 25 pts
From `CategoryConfig.expansion_potential` (0–100).
Scaled to 0–25 pts. Default = 50 → 12.5 pts.

| Category | expansion_potential | Points |
|---|---|---|
| Supplements | 90 | 22.5 |
| Beauty | 80 | 20 |
| Pet | 75 | 18.75 |
| Kitchen | 60 | 15 |
| Unknown | 50 | 12.5 |

---

## Component 7 — REVIEW INTEGRITY SCORE (5%)

**Question answered:** Is the review history clean, or is there evidence of Amazon penalization / manipulation?

**Data source:** Keepa `history.review_count` time-series

This component is a **gate** in the recommendation logic, not just a weighted contributor.
A product scoring < 50 here will not receive STRONG OPPORTUNITY regardless of other scores.
A product scoring < 40 here will receive REJECT regardless of other scores.

### Wipe Detection Algorithm

A "wipe event" is a single observation where review count drops by:
- ≥ 20 absolute reviews, OR
- ≥ 15% of the previous count

Both thresholds must align with a genuine downward transition in the history series.
Natural correction noise (± 1–3 reviews) does not trigger detection.

### Scoring Table

| Wipe Events | Severity | Score | Label |
|---|---|---|---|
| 0 | None | 100 | Clean history |
| 1 | < 50 reviews removed | 75 | Minor irregularity |
| 1 | 50–200 reviews removed | 55 | Moderate concern |
| 1 | > 200 reviews removed | 30 | Severe — likely penalized |
| 2 | Any | 20 | Pattern — systematic manipulation |
| 3+ | Any | 10 | Systematic — disqualifying signal |
| N/A | Insufficient history (< 3 pts) | 50 | Unverifiable — neutral |

### Recommendation Gates

```
review_integrity_score < 40  →  REJECT  (overrides all other scores)
review_integrity_score < 60  →  cannot reach STRONG OPPORTUNITY
review_integrity_score ≥ 60  →  no gate restriction
```

**Why this matters:** V2 had no integrity check. In Kitchen deep-validation (2026-06-04),
3/3 top-ranked products received REJECT for Amazon review wipes.
The wipe data was present in Keepa history — V2 simply never read it.

---

## Output Fields Per Product

| Field | Type | Source |
|---|---|---|
| `asin` | str | Keepa |
| `title` | str | Keepa |
| `brand` | str/None | Keepa |
| `final_score` | float 0–100 | V3 engine |
| `demand_score` | float 0–100 | Component 1 |
| `new_seller_score` | float 0–100 | Component 2 |
| `listing_weakness_score` | float 0–100 | Component 3 |
| `trend_velocity_score` | float 0–100 | Component 4 |
| `market_saturation_score` | float 0–100 | Component 5 |
| `brand_expansion_score` | float 0–100 | Component 6 |
| `review_integrity_score` | float 0–100 | Component 7 |
| `estimated_monthly_sales` | int/None | BSR calibration |
| `estimated_monthly_revenue` | float/None | sales × price |
| `price` | float/None | Keepa (4-level cascade) |
| `fba_size_tier` | str | keepa.fba |
| `estimated_fba_fee` | float/None | keepa.fba |
| `net_margin_pct` | float/None | keepa.fba |
| `competition_level` | Low/Medium/High | market_saturation_score |
| `risk_level` | Low/Medium/High | review_integrity + demand |
| `recommendation` | STRONG OPPORTUNITY / WORTH RESEARCH / REJECT | rule logic |
| `wipe_events` | int | review_integrity component |
| `wipe_detail` | str | review_integrity component |
| `confidence` | float 0–100 | data quality aggregate |

---

## Confidence System

Each component reports a confidence score (0–100) based on data availability.

| Component | High Confidence (≥70) | Low Confidence (≤40) |
|---|---|---|
| demand | ≥15 BSR history pts | < 5 pts |
| new_seller | ≥ 3 products with review history | 0 products |
| listing_weakness | ratings available | all null ratings |
| trend_velocity | ≥1 live source | all stubs (always 0) |
| market_saturation | offer_count + price_band | both null |
| brand_expansion | median sales + price | no data |
| review_integrity | ≥3 review history pts | < 3 pts |

**Final confidence** = weighted average of component confidences.
Displayed in output but does NOT modify the score — it's informational only.

---

## Recommendation Thresholds Summary

| Verdict | Condition |
|---|---|
| STRONG OPPORTUNITY | `final_score ≥ 72` AND `review_integrity ≥ 60` AND `demand_score ≥ 55` |
| WORTH RESEARCH | `final_score ≥ 45` AND `review_integrity ≥ 40` |
| REJECT | Everything else |
