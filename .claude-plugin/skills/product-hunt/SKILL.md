# Skill: product-hunt

## Command
`/product-hunt <niche>`

## Description
Run the complete Amazon Product Opportunity Intelligence System against a niche. Twelve specialized agents analyze the market in sequence, building a full picture of demand, competition, small-seller access, supplier viability, finances, legal risk, customer validation, launch difficulty, brand potential, and scalability. The final agent synthesizes everything into scored, ranked, disqualification-filtered results and writes four output files to disk.

**Goal:** Identify products with real customer demand, beatable competition, strong margins, low legal risk, strong brand potential, strong content potential, and long-term scalability — ranked by probability of building a successful Amazon brand.

---

## Parameters
| Parameter | Type   | Required | Example |
|-----------|--------|----------|---------|
| `niche`   | string | Yes      | `"silicone kitchen tools"` |

---

## Execution Pipeline

Run agents in the following strict order. Each agent outputs a JSON block passed downstream.

### Step 1 — amazon-demand-analyzer
**Input:** niche keyword
**Collect:** `demand_score`, `classification`, `avg_bsr_top5`, `sponsored_density`, `review_velocity`, `total_sellers_estimate`, `demand_depth`, `demand_velocity_trend`, `seasonal_peak`

### Step 2 — competition-analyzer
**Input:** niche + Step 1 signals
**Collect:** `competition_score`, `market_saturation_score`, `market_saturation_label`, `avg_reviews_page1`, `brand_lock`, `review_distribution`, `new_seller_success_rate`, `active_competitor_estimate`, `price_range`

### Step 3 — small-seller-success-detector
**Input:** niche + Step 2 data
**Collect:** `small_seller_opportunity_score`, `tier_analysis`, `review_to_revenue_efficiency`, `accessibility_verdict`, `dominant_differentiation_pattern`

### Step 4 — profit-opportunity-analyzer
**Input:** niche + price range from Step 2 + BSR from Step 1
**Collect:** `profit_score`, `complexity_tier`, `product_cost`, `shipping_cost`, `marketplace_fees`, `selling_price`, `profit_per_unit` (3 scenarios), `startup_budget` (3 tiers × 11 items), `break_even`, `profit_projections` (months 1/3/6), `complexity_risk_score`, `supply_chain_risk_score`

### Step 5 — trend-validator
**Input:** niche + `classification` + `demand_score`
**Collect:** `tiktok_score`, `brand_expansion_score`, `tiktok_dimensions` (6), `brand_dimensions` (4), `trend_direction`, `lifecycle_classification`, `seasonality_risk_score`

### Step 6 — supplier-analyzer
**Input:** niche + `complexity_tier` from Step 4
**Collect:** `supplier_difficulty_score`, `supplier_classification`, `moq_flexibility`, `private_label_friendliness`, `hazmat_flag`

### Step 7 — legal-risk-analyzer
**Input:** niche + `brand_lock` from Step 2 + `hazmat_flag` from Step 6
**Collect:** `patent_risk_score`, `legal_risk_score`, `return_risk_score`, `patent_classification`, `legal_classification`, `return_classification`, `amazon_gating_level`, `brand_enforcement_risk`, `disqualification_flags`

### Step 8 — product-validation-analyzer
**Input:** niche + `demand_score` + `avg_reviews_page1` + `lifecycle_classification`
**Collect:** `validation_score`, `validation_classification`, `top_customer_pain_points`, `top_product_weaknesses`, `improvement_opportunities`, `community_signal`, `social_signal`, `validation_verdict`

### Step 9 — launch-difficulty-analyzer
**Input:** niche + `competition_score` + `avg_reviews_page1` + `brand_lock` + `market_saturation_label` + `new_seller_success_rate` + `sponsored_density` + `demand_score`
**Collect:** `launch_difficulty_score`, `launch_classification`, `ppc_estimates`, `review_estimates`, `time_to_rank`, `average_launch_budget_estimate`

### Step 10 — opportunity-size-analyzer
**Input:** niche + demand/competition/trend/profit outputs from Steps 1–5
**Collect:** `opportunity_size_score`, `business_classification`, `revenue_potential`, `growth_trajectory`, `market_ceiling_annual`, `exit_value_estimate`

### Step 11 — brand-builder-agent
**Input:** all scored products where `master_opportunity_score > 75` (computed in Step 12 preview, or use `final_opportunity_score > 75` as proxy)
**Actions:** Generate brand identity + product line expansion map for qualifying products
**Output:** Writes `brand-builder-report.md` to disk

### Step 12 — product-opportunity-ranker
**Input:** merged output from all 11 agents for every candidate product
**Actions:**
1. Compute all composite scores (Risk Score, Hidden Gem Score, D/C Ratio, Master Opportunity Score)
2. Apply all 8 disqualification rules
3. Assign 6-tier recommendation verdicts
4. Generate 4 ranked lists
5. Generate investment recommendations (Bootstrap / Recommended / Aggressive)
6. Write `product-opportunity-report.md`
7. Write `product-ranking.json`
8. Write `investment-analysis.md`
9. Confirm `brand-builder-report.md` was written by Step 11

---

## Composite Score Formulas

### Risk Score (0–100, higher = MORE risk)
```
Risk Score =
  (patent_risk_score       × 0.30)
+ (legal_risk_score        × 0.15)
+ (seasonality_risk_score  × 0.20)
+ (return_risk_score       × 0.15)
+ (complexity_risk_score   × 0.10)
+ (supply_chain_risk_score × 0.10)
```

### D/C Ratio
```
D/C Ratio = demand_score / (101 - competition_score)
```
| Value | Label |
|-------|-------|
| > 2.0  | Excellent |
| 1.5–2.0 | Good |
| 1.0–1.5 | Average |
| < 1.0   | Poor |

### Hidden Gem Score (0–100)
```
Trend Bonus: Rising=100 | Emerging=80 | Stable=60 | Declining=20

Hidden Gem Score =
  (demand_score                   × 0.25)
+ (competition_score              × 0.25)
+ (small_seller_opportunity_score × 0.20)
+ (profit_score                   × 0.20)
+ (Trend Bonus                    × 0.10)
```

### Master Opportunity Score (0–100)
```
Master Opportunity Score =
  (demand_score                         × 0.15)
+ (competition_score                    × 0.12)
+ (profit_score                         × 0.12)
+ (small_seller_opportunity_score       × 0.12)
+ (validation_score                     × 0.10)
+ (opportunity_size_score               × 0.10)
+ (hidden_gem_score                     × 0.08)
+ (brand_expansion_score                × 0.07)
+ ((100 - launch_difficulty_score)      × 0.06)
+ ((100 - patent_risk_score)            × 0.05)
+ ((100 - return_risk_score)            × 0.01)
+ (tiktok_score                         × 0.01)
+ ((100 - supplier_difficulty_score)    × 0.01)
```
Round to nearest whole number. Total weights = 1.00.

---

## Disqualification Rules
A product is automatically ⛔ Disqualified if ANY condition is true:

| # | Rule | Condition |
|---|------|-----------|
| 1 | Patent Risk | `patent_risk_score >= 70` |
| 2 | Dangerous Product | Chemicals, flammables, unregulated electrical, weapons, infant choking hazards |
| 3 | High Return Risk | `return_risk_score >= 75` |
| 4 | Marketplace Gated | `amazon_gating_level == "High"` |
| 5 | Extreme Saturation | `market_saturation_label == "Oversaturated"` AND `competition_score <= 25` |
| 6 | Hazmat | Product classified as hazardous under carrier/marketplace rules |
| 7 | Brand Enforcement | `brand_enforcement_risk == "High"` |
| 8 | Adult Category | Product falls in adult/18+ gated segment |

---

## Recommendation Verdicts (6 Tiers)

| Condition | Verdict |
|-----------|---------|
| Score ≥ 82 AND Risk ≤ 45 AND Validation ≥ 70 | 🟢 Immediate Launch |
| Score ≥ 72 AND Risk ≤ 60 | 🟢 Strong Buy |
| Score 58–71 | 🟡 Worth Testing |
| Score 42–57 OR (Score ≥ 58 AND Risk > 65) | 🟠 Watch List |
| Score < 42 | 🔴 Avoid |
| Any disqualification triggered | ⛔ Disqualified |

---

## Output Files (4 Total)

| File | Content | Written By |
|------|---------|-----------|
| `product-opportunity-report.md` | Full 18-section professional report per product | product-opportunity-ranker |
| `product-ranking.json` | Machine-readable ranked array with all 13 scores + financials | product-opportunity-ranker |
| `brand-builder-report.md` | Brand identity + expansion map for products scoring > 75 | brand-builder-agent |
| `investment-analysis.md` | Side-by-side investment comparison for all ranked products | product-opportunity-ranker |

---

## Constraints
- All financial figures are estimates derived from public benchmarks — always label them as such.
- The full 12-step pipeline must complete before any output is shown.
- Risk Score > 80 forces ⛔ Disqualified regardless of opportunity score.
- Every product must receive a Final Verdict and a Most Important Next Action — no exceptions.
- The goal is to rank by probability of building a successful Amazon brand, not merely by short-term profit potential.
