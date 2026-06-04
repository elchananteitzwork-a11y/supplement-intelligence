# Scoring Engine — Critical Audit

**Audited:** `keepa/scoring.py` — 12-factor, 0–100 scoring model  
**Method:** 10 attack cases run through live scoring code

---

## VERDICT

The scoring engine is structurally unsound for 3 reasons:

1. **39 of 100 points are identical for every product in the same analysis run** — they come from category-level aggregates, not per-product data.
2. **0 reviews scores better than 50 reviews** — unvalidated products score higher than proven ones.
3. **The BSR→sales conversion table has no category calibration** — BSR 3,000 in Kitchen and BSR 3,000 in Industrial yield the same sales estimate, which is wrong by ~10×.

---

## 10 Misleading Score Examples

### Case 1 — PPC Honeymoon Launch: **92/100 (A — Excellent)**

**Product:** Brand-new listing, 0 reviews, BSR 800 (inflated by launch PPC spend)  
**Reality:** This BSR is entirely artificial. The moment the PPC budget stops, BSR collapses.  
**Why the score is wrong:**
- 0 reviews = 8/8 "very low barrier" — treats no reviews as an advantage
- Improving trend = 10/10 — any new launch has an "improving" BSR by definition
- The engine has no awareness that this could be a 30-day-old listing

**Actual score:** 92/100  
**Honest score:** should be flagged with a confidence warning, not awarded "Excellent"

---

### Case 2 — High-Volume Negative-Margin Product: **67/100 (B — Good)**

**Product:** BSR 150, $5.99 price, 2kg heavy oversized item  
**Reality:** FBA fees for a 2kg oversized item ≈ $5.50–$7.00. At $5.99, this product **loses money** on every sale.  
**Why the score is wrong:**
- Demand Level: 15/15 (8,000 sales/mo = highest score)
- Revenue Potential: 10/10 ($47,920/mo gross revenue looks great)
- Profit Margin Proxy: 0/6 (correctly penalizes $5.99 price)
- But 25/25 on demand + revenue completely drowns out the 0/6 margin signal

**Actual score:** 67/100 (Good Opportunity)  
**Honest score:** should be 20–30. The engine can't detect that gross revenue ≠ profit.

---

### Case 3 — Lightning Deal as Quality Signal (Penalized as Bad): **-3 pts penalty, always**

**Product:** BSR 800, $29.99, 380 reviews — a well-established kitchen product  
**Without Lightning Deal:** 77/100  
**With Lightning Deal (identical product):** 74/100  

**Why the score is wrong:**  
Lightning Deal eligibility requires strong conversion rates, good reviews, and Amazon approval. It is often a signal of an **established, high-quality product** — exactly the type a new seller should study and compete against. The engine always penalizes it as desperation discounting.

**The penalty is context-blind:** the score can't distinguish:
- A desperate seller dropping prices to liquidate inventory (-3 = correct)
- Amazon featuring a top-performing product in a Flash Sale (-3 = wrong)

---

### Case 4 — Reliable Seasonal Product Underscored: **81/100 instead of ~88**

**Product:** Christmas Glass Ornament Set, BSR 2,000, 85 reviews, improving trend  
**Seasonality penalty:** 2/5 instead of 5/5 = **-3 points**  

**Why the score is misleading:**  
Seasonal products with a **known, predictable peak** (Christmas, Halloween, Back-to-School) are often highly profitable specifically *because* of seasonality:
- Lower competition during off-season = cheaper PPC
- Clear launch timing = lower inventory risk
- Established demand pattern = low sales uncertainty

The score treats all seasonal products as equally risky, with a flat 3-point penalty regardless of whether the peak is "December" (very predictable) or "Detected — review history timestamps for exact months" (unknown).

---

### Case 5 — Zero-Review Unvalidated Product: **82/100 (A — Excellent)**

**Product:** No reviews, BSR 3,000, improving trend, "Highly Accessible" category  
**Why the score is wrong:**  
0 reviews means this product has **never had a single verified buyer**. It could be:
- A listing that was just created today
- A product that never sold organically (all giveaway BSR)
- A product with a fundamental flaw that no customer will review positively

**The engine awards 8/8 on review_barrier for 0 reviews** — treating "no proof of market validation" as "low competition to beat." This is the exact opposite of what a new seller needs to know.

---

### Case 6 — Category-Level Factors: 39 Points Identical for Every Product in a Run

**The structural issue:**  
Factors 4, 7, 8, 9, 10 are sourced from `ReviewVelocityAnalysis` and `PriceAnalysis` — which are **category-level aggregates**. Every product in the same analysis run gets the **identical score** on these 5 factors.

| Factor | Weight | Source |
|--------|--------|--------|
| Competition Accessibility | 10 | Category-level (`rv.accessibility_verdict`) |
| Price Stability | 8 | Category-level (`pa.price_trend`) |
| Price Compression Risk | 8 | Category-level (`pa.price_band_usd`) |
| Buy Box Opportunity | 8 | Category-level (`pa.amazon_holds_buybox_pct`) |
| Promotional Pressure | 5 | Category-level (`pa.has_lightning_deal_activity`) |
| **Subtotal** | **39** | |

**Demonstrated:** Two products in the same run — BSR 500 (score 82) and BSR 85,000 (score 47). Their 39 shared points are **completely identical**. The ranking between them is driven only by demand, trend, revenue, review counts, and margin — the other 39 points are noise that inflates both scores uniformly.

---

### Case 7 — Thin Review History Falsely Signals "Slow Market": **7/7 velocity**

**Product:** 2 review data points, both showing 120 reviews (no change) → velocity = 0.0/mo  
**Actual score on velocity:** 7/7 — "slow market, easy to catch up"  

**Why it's wrong:**  
The velocity calculation uses `delta / (days / 30.0)` with `days=90` as a fixed denominator. If a product only has 2 data points 2 days apart with no review change:
- `delta = 0`
- `months_elapsed = 90 / 30 = 3.0` (even though only 2 days of data exist)
- `velocity = 0.0 / 3.0 = 0.0/mo`

**0.0/mo awards 7/7 — the best possible velocity score.** Missing data looks like the safest market possible. Any product with sparse review history (new listing, thin Keepa tracking) gets rewarded.

---

### Case 8 — High-Ticket Product Blindspot: **85/100 (A — Excellent)**

**Product:** $199 consumer drone, BSR 1,200, 90 reviews  
**Score breakdown:**
- Revenue Potential: 10/10 ($218,890/mo)
- Profit Margin: 6/6 ($199 price)
- Demand Level: 15/15

**What the score ignores:**
- Return rates for electronics are 15–30% vs 2–5% for kitchen goods
- FBA storage and return processing fees on $199 items are significant
- Consumer electronics require certifications (FCC, CE) that take months and thousands of dollars
- Brand trust is critical — new sellers with 0 brand history cannot compete at $199
- PPC costs to compete in electronics are 5–10× higher than kitchen

**Actual score:** 85/100 — would send a new seller into one of the hardest categories.

---

### Case 9 — Rising Price + Declining Demand = Dying Category, Scored as "Stable"

**Product:** BSR 45,000, declining trend, decelerating velocity, but rising prices  
**Price Stability score:** 8/8 — "Prices rising — market has pricing power"  

**Why it's wrong:**  
Prices rise in a dying market because sellers are **exiting** — they raise prices to clear remaining inventory and reduce ordering. Rising prices combined with declining BSR and decelerating demand is a **red flag**, not a green one. The engine cannot read the combination; it scores each factor independently.

**Actual score:** 47/100 (the demand signals rescue it from being worse, but price_stability gets full marks).

---

### Case 10 — Category-Agnostic BSR-to-Sales Table: **Identical scores for different realities**

**BSR 3,000 in Kitchen:** ~490 sales/mo (high-velocity category)  
**BSR 3,000 in Industrial & Scientific:** ~50 sales/mo (low-velocity category)  

**Both score:** 72/100 — identical in every factor.

The BSR_SALES_TABLE in `keepa/sales_estimate.py` uses a single universal curve. Amazon BSR is relative **within a category**, not across categories. A BSR of 3,000 means "3,000th best seller in that category." Categories with 2 million products have very different unit volumes at BSR 3,000 than categories with 50,000 products.

The demand estimate, revenue estimate, and confidence score are all wrong for any category that deviates from the "general merchandise" baseline the table was built on.

---

## Structural Weaknesses

### W1: 39 points are identical per run
Category-level factors (accessibility, price stability, compression, Buy Box, promotions) give every product the same base. A product scored alone would get a completely different absolute score than one scored in a batch. The score is **relative within a run**, not an absolute measure.

### W2: No minimum review validation floor
0 reviews scores better than 500 reviews. There is no floor that says "this product has not been market-validated." A new listing with artificial BSR and 0 reviews can score 92/100.

### W3: Revenue ≠ Profit — no cost model
Gross revenue is a proxy that breaks for:
- Low-price, heavy, or oversized products (FBA fee > selling price)
- High-return categories (electronics, clothing)
- Products requiring certification or insurance

### W4: BSR-to-Sales has no category calibration
The conversion table assumes a "general merchandise" category velocity. It is wrong for any specialty, industrial, or low-volume category.

### W5: Velocity defaults to 0.0 for sparse data
Missing review history returns `None` → 3/7 (neutral). Two identical data points return `0.0/mo` → 7/7 (best). Sparse data actively scores better than moderate data.

### W6: Rising price is unconditionally good
The engine cannot detect rising prices caused by market exit vs. genuine demand growth. The correlation check with trend_direction is never performed.

### W7: Buy Box defaults to optimistic (6/8 for missing data)
When `amazon_holds_buybox_pct` is None — which is common — the engine assumes a friendly 3P environment and awards 6/8. Missing data should default to neutral (4/8) or require a penalty.

### W8: Seasonality is flat and sign-unaware
All seasonal products lose 3 points regardless of whether the peak is predictable (December), unknown, or advantageous for a planned launch. Seasonal amplitude and predictability are ignored.

### W9: No product-level price signals
Price stability, compression, and Buy Box all come from the category average. A product priced $10 above category average and a product priced at the floor get the same score on all three factors.

### W10: No offer count input
`current.offer_count` is captured in the normalized product but never used in scoring. 2 sellers at a price point vs. 40 sellers is a meaningful differentiation the model ignores.

---

## Suggested Improvements (no code changes in this audit)

| Priority | Fix | Impact |
|----------|-----|--------|
| 1 | **Minimum review floor**: 0 reviews → score 4/8 max on review_barrier (unvalidated flag) | Prevents 92/100 ghost listings |
| 2 | **Per-product price factors**: use product price for compression/stability, not category avg | Fixes W9 |
| 3 | **BSR age awareness**: if BSR history < 60 days, apply confidence penalty to trend score | Fixes Case 1 |
| 4 | **Margin model**: incorporate package weight/dimensions to estimate FBA tier and fee | Fixes W3 |
| 5 | **Category calibration multiplier**: `bsr_to_monthly_sales` should accept a category factor | Fixes W4 |
| 6 | **Velocity data quality check**: if history < 5 data points, cap velocity score at 4/7 | Fixes W5 |
| 7 | **Rising price + declining demand check**: cross-factor penalty when trend=Declining + price_trend=Rising | Fixes W6 |
| 8 | **Buy Box default to neutral**: None → 4/8, not 6/8 | Fixes W7 |
| 9 | **Offer count factor**: replace or supplement promotional_pressure with seller count | Fixes W10 |
| 10 | **Seasonal amplitude scoring**: known December peak = 4/5, unknown = 2/5 | Fixes W8 |
