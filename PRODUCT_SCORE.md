# Product Opportunity Score — Formula Reference

## Overview

Each product receives a score from **0 to 100** computed across **12 weighted factors**.  
Higher score = better opportunity for a new Amazon FBA seller to enter and compete.

Implemented in: `keepa/scoring.py`  
Output field in `keepa-report.json`: `product_scores[].total_score`, `products[].opportunity_score`

---

## Grade Bands

| Score   | Grade | Verdict              |
|---------|-------|----------------------|
| 80–100  | A     | Excellent Opportunity |
| 65–79   | B     | Good Opportunity      |
| 50–64   | C     | Average Opportunity   |
| 35–49   | D     | Below Average         |
| 0–34    | F     | Poor Opportunity      |

---

## The 12 Factors

| # | Factor | Weight | Signal source |
|---|--------|--------|---------------|
| 1 | Demand Level | 15 | `BSRAnalysis.estimated_monthly_sales` |
| 2 | Demand Trend | 10 | `BSRAnalysis.trend_direction` + `demand_velocity` |
| 3 | Revenue Potential | 10 | Monthly sales × product price |
| 4 | Competition Accessibility | 10 | `ReviewVelocityAnalysis.accessibility_verdict` |
| 5 | Review Barrier | 8 | Product's own `current.review_count` |
| 6 | Review Velocity Threat | 7 | Product's own monthly review velocity |
| 7 | Price Stability | 8 | `PriceAnalysis.price_trend` |
| 8 | Price Compression Risk | 8 | `PriceAnalysis.price_compression` + `price_band_usd` |
| 9 | Buy Box Opportunity | 8 | `PriceAnalysis.amazon_holds_buybox_pct` |
| 10 | Promotional Pressure | 5 | `PriceAnalysis.has_lightning_deal_activity` + `coupon_price_detected` |
| 11 | Seasonality Risk | 5 | `BSRAnalysis.is_seasonal` |
| 12 | Profit Margin Proxy | 6 | Product price vs FBA-viable thresholds |
| | **TOTAL** | **100** | |

---

## Factor Scoring Rules

### 1. Demand Level (15 pts)
Monthly unit sales estimate derived from BSR via log-linear interpolation.

| Monthly Sales | Points |
|---------------|--------|
| ≥ 1,000       | 15     |
| 500 – 999     | 12     |
| 200 – 499     | 9      |
| 100 – 199     | 5      |
| 50 – 99       | 2      |
| < 50          | 0      |

### 2. Demand Trend (10 pts)
Combines 90-day BSR trend direction with 30d-vs-90d demand velocity.

| Trend      | Velocity      | Points |
|------------|---------------|--------|
| Improving  | Accelerating  | 10     |
| Improving  | Stable        | 8      |
| Improving  | Decelerating  | 6      |
| Stable     | Accelerating  | 7      |
| Stable     | Stable        | 5      |
| Stable     | Decelerating  | 3      |
| Declining  | any           | 0–2    |

### 3. Revenue Potential (10 pts)
Estimated monthly gross revenue = monthly sales × product price.

| Monthly Revenue | Points |
|-----------------|--------|
| ≥ $20,000       | 10     |
| $10,000–19,999  | 8      |
| $5,000–9,999    | 6      |
| $2,500–4,999    | 4      |
| $1,000–2,499    | 2      |
| < $1,000        | 0      |

### 4. Competition Accessibility (10 pts)
Category-level verdict from review velocity analysis.

| Verdict           | Points | Meaning |
|-------------------|--------|---------|
| Highly Accessible | 10     | 3+ sellers < 100 reviews making real sales |
| Accessible        | 7      | Multiple sellers < 500 reviews competing |
| Hard to Enter     | 3      | Few sellers below 1,000 reviews |
| Locked            | 0      | Dominated by established sellers |

### 5. Review Barrier (8 pts)
This specific product's review count — lower = lower barrier to outcompete.

| Review Count | Points |
|--------------|--------|
| < 50         | 8      |
| 50–99        | 6      |
| 100–249      | 4      |
| 250–499      | 2      |
| ≥ 500        | 0      |

### 6. Review Velocity Threat (7 pts)
How fast competitors are gaining reviews. Slower = easier to catch up.

| Reviews/Month | Points |
|---------------|--------|
| < 5           | 7      |
| 5–14          | 5      |
| 15–29         | 3      |
| ≥ 30          | 1      |

### 7. Price Stability (8 pts)
Category price trend over 90 days.

| Trend    | Points | Meaning |
|----------|--------|---------|
| Rising   | 8      | Pricing power — good time to enter |
| Stable   | 6      | Predictable margins |
| Declining| 1      | Race to bottom — margin erosion |

### 8. Price Compression Risk (8 pts)
Width of category price band (max − min current price).

| Price Band      | Points | Status |
|-----------------|--------|--------|
| > $10           | 8      | Healthy spread |
| $5–$10          | 6      | Moderate spread |
| $3–$5           | 3      | Tight |
| < $3 (compressed) | 0   | Race to bottom |

### 9. Buy Box Opportunity (8 pts)
Percentage of time Amazon (not 3P sellers) holds the Buy Box.

| Amazon BB %     | Points | Meaning |
|-----------------|--------|---------|
| < 20% or N/A    | 6–8    | Strong 3P opportunity |
| 20–39%          | 6      | Moderate opportunity |
| 40–59%          | 4      | Partial Amazon dominance |
| 60–79%          | 2      | Amazon dominant |
| ≥ 80%           | 0      | Amazon locked |

### 10. Promotional Pressure (5 pts)
Lightning Deal and coupon activity signals.

| Activity          | Points |
|-------------------|--------|
| No activity       | 5      |
| One signal        | 2      |
| Both signals      | 0      |

### 11. Seasonality Risk (5 pts)
Based on BSR variance ratio over 365 days (max/min BSR > 1.6 = seasonal).

| Seasonal?  | Points |
|------------|--------|
| No         | 5      |
| Yes        | 2      |

### 12. Profit Margin Proxy (6 pts)
Average selling price vs FBA fee viability thresholds.

| Avg Price | Points |
|-----------|--------|
| ≥ $35     | 6      |
| $25–$34   | 5      |
| $20–$24   | 4      |
| $15–$19   | 3      |
| $10–$14   | 1      |
| < $10     | 0      |

---

## Example Calculations

### Example 1 — Excellent Opportunity (90/100, Grade A)

**Product:** Collapsible Silicone Straws — Set of 6  
**ASIN:** B00STRAW01  
**Price:** $24.99  

| # | Factor | Max | Score | Rationale |
|---|--------|-----|-------|-----------|
| 1 | Demand Level | 15 | 12 | 450 units/mo — solid demand |
| 2 | Demand Trend | 10 | 10 | Improving + Accelerating |
| 3 | Revenue Potential | 10 | 8 | $11,246/mo — strong revenue |
| 4 | Competition Accessibility | 10 | 10 | Highly Accessible (3 sellers < 100 reviews making sales) |
| 5 | Review Barrier | 8 | 8 | 45 reviews — very low barrier |
| 6 | Review Velocity Threat | 7 | 5 | 6 reviews/mo — moderate |
| 7 | Price Stability | 8 | 6 | Stable pricing |
| 8 | Price Compression Risk | 8 | 8 | $9.50 band — healthy spread |
| 9 | Buy Box Opportunity | 8 | 8 | Amazon holds BB 12% — strong 3P opportunity |
| 10 | Promotional Pressure | 5 | 5 | No promotional activity |
| 11 | Seasonality Risk | 5 | 5 | Year-round demand |
| 12 | Profit Margin Proxy | 6 | 5 | $24.99 — good margins |
| | **TOTAL** | **100** | **90** | **Grade A — Excellent Opportunity** |

**Why 90:** Low review barrier (45 reviews), improving trend, Highly Accessible verdict, healthy price band, no Amazon Buy Box dominance, stable prices. A new seller could launch and compete directly.

---

### Example 2 — Average Opportunity (52/100, Grade C)

**Product:** Stainless Steel Measuring Cups — Set of 7  
**ASIN:** B00CUPS001  
**Price:** $18.99  

| # | Factor | Max | Score | Rationale |
|---|--------|-----|-------|-----------|
| 1 | Demand Level | 15 | 9 | 200 units/mo — moderate demand |
| 2 | Demand Trend | 10 | 5 | Stable + Stable |
| 3 | Revenue Potential | 10 | 4 | $3,798/mo — moderate revenue |
| 4 | Competition Accessibility | 10 | 7 | Accessible (5 sellers < 500 reviews) |
| 5 | Review Barrier | 8 | 2 | 280 reviews — high barrier |
| 6 | Review Velocity Threat | 7 | 3 | 22 reviews/mo — fast, hard to catch |
| 7 | Price Stability | 8 | 1 | Declining prices — margin pressure |
| 8 | Price Compression Risk | 8 | 6 | $6.50 band — moderate spread |
| 9 | Buy Box Opportunity | 8 | 4 | Amazon holds BB 52% — partial dominance |
| 10 | Promotional Pressure | 5 | 2 | Lightning Deal activity detected |
| 11 | Seasonality Risk | 5 | 5 | Year-round demand |
| 12 | Profit Margin Proxy | 6 | 4 | $18.99 — moderate margins |
| | **TOTAL** | **100** | **52** | **Grade C — Average Opportunity** |

**Why 52:** Decent demand and accessibility, but declining prices, Amazon holds half the Buy Box, 280 reviews to compete against, and active promotions signal a competitive market. Possible but not ideal.

---

### Example 3 — Poor Opportunity (32/100, Grade F)

**Product:** Disposable Plastic Cutlery Set — 100 Pack  
**ASIN:** B00CUTLRY1  
**Price:** $7.99  

| # | Factor | Max | Score | Rationale |
|---|--------|-----|-------|-----------|
| 1 | Demand Level | 15 | 15 | 2,800 units/mo — high demand |
| 2 | Demand Trend | 10 | 0 | Declining + Decelerating — avoid |
| 3 | Revenue Potential | 10 | 10 | $22,372/mo — but no margin |
| 4 | Competition Accessibility | 10 | 0 | Locked — dominated by established sellers |
| 5 | Review Barrier | 8 | 0 | 4,800 reviews — impossible barrier |
| 6 | Review Velocity Threat | 7 | 1 | 55 reviews/mo — very fast |
| 7 | Price Stability | 8 | 1 | Prices declining |
| 8 | Price Compression Risk | 8 | 0 | $1.80 band — severely compressed |
| 9 | Buy Box Opportunity | 8 | 0 | Amazon holds BB 88% — locked out |
| 10 | Promotional Pressure | 5 | 0 | Lightning deals + coupons both active |
| 11 | Seasonality Risk | 5 | 5 | Year-round demand |
| 12 | Profit Margin Proxy | 6 | 0 | $7.99 — FBA fees consume all margin |
| | **TOTAL** | **100** | **32** | **Grade F — Poor Opportunity** |

**Why 32:** The paradox product — high sales volume and revenue figures look attractive, but every competition and margin signal is red. Amazon dominates the Buy Box, prices are compressed to $1.80 spread, 4,800 reviews to beat, declining trend, and $7.99 leaves nothing after FBA fees (~$3.22) and COGS. A new seller would lose money.

---

## Output in keepa-report.json

Each product in `products[]` receives injected fields:
```json
{
  "asin": "B001XXXXX",
  "opportunity_score": 76.0,
  "grade": "B",
  "verdict": "Good Opportunity",
  ...
}
```

Full factor breakdown in `product_scores[]`:
```json
{
  "asin": "B001XXXXX",
  "title": "...",
  "total_score": 76.0,
  "grade": "B",
  "verdict": "Good Opportunity",
  "estimated_monthly_sales": 431,
  "estimated_monthly_revenue": 10770.69,
  "factors": [
    {"name": "demand_level", "weight": 15, "score": 9, "rationale": "431 units/mo — moderate demand"},
    ...
  ]
}
```

Top-level summary in `scoring_summary`:
```json
{
  "total_scored": 20,
  "grade_A": 2,
  "grade_B": 5,
  "grade_C": 8,
  "grade_D": 3,
  "grade_F": 2,
  "avg_score": 54.3,
  "top_opportunity": {
    "asin": "B001XXXXX",
    "score": 88.0,
    "grade": "A",
    "verdict": "Excellent Opportunity"
  }
}
```
