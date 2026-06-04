# PROJECT STATUS
## Amazon Product Opportunity Intelligence System
**Plugin Version:** 0.4.0
**Status:** Framework Complete — Data Layer Pending
**Last Updated:** 2026-06-03
**Repository:** https://github.com/elchananteitzwork-a11y/amazon-opportunity-hunter

---

## What Was Built

A complete Claude Code plugin that runs a 12-agent intelligence pipeline to find, score, rank, and validate Amazon product opportunities. The system produces four professional output reports per research run.

**Core premise:** No single metric predicts a winning product. The system combines 13 weighted signals — demand, competition, small-seller proof, validation, margins, legal risk, supplier access, brand potential, virality, launch difficulty, and market ceiling — into one Master Opportunity Score that ranks products by probability of building a successful Amazon brand.

---

## System Architecture

```
/product-hunt <niche>
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│                   12-STEP PIPELINE                       │
│                                                         │
│  Step 1   amazon-demand-analyzer                        │
│  Step 2   competition-analyzer                          │
│  Step 3   small-seller-success-detector                 │
│  Step 4   profit-opportunity-analyzer                   │
│  Step 5   trend-validator                               │
│  Step 6   supplier-analyzer                             │
│  Step 7   legal-risk-analyzer                           │
│  Step 8   product-validation-analyzer                   │
│  Step 9   launch-difficulty-analyzer                    │
│  Step 10  opportunity-size-analyzer                     │
│  Step 11  brand-builder-agent  (score > 75 only)        │
│  Step 12  product-opportunity-ranker  (final output)    │
└─────────────────────────────────────────────────────────┘
        │
        ▼
  4 output files written to disk
```

---

## File Structure

```
.claude-plugin/
├── plugin.json                              v0.4.0
│
├── agents/                                  12 agents
│   ├── amazon-demand-analyzer/AGENT.md
│   ├── brand-builder-agent/AGENT.md
│   ├── competition-analyzer/AGENT.md
│   ├── launch-difficulty-analyzer/AGENT.md
│   ├── legal-risk-analyzer/AGENT.md
│   ├── opportunity-size-analyzer/AGENT.md
│   ├── product-opportunity-ranker/AGENT.md
│   ├── product-validation-analyzer/AGENT.md
│   ├── profit-opportunity-analyzer/AGENT.md
│   ├── small-seller-success-detector/AGENT.md
│   ├── supplier-analyzer/AGENT.md
│   └── trend-validator/AGENT.md
│
├── hooks/                                   (empty — reserved)
├── references/                              (empty — reserved)
│
└── skills/                                  2 skills
    ├── product-hunt/SKILL.md
    └── find-products-under-budget/SKILL.md
```

---

## All Agents (12)

### 1. amazon-demand-analyzer
**Purpose:** Measures how strongly the market wants a product.
**Key outputs:** `demand_score`, `classification`, `avg_bsr_top5`, `sponsored_density`, `review_velocity`, `total_sellers_estimate`, `demand_depth`, `demand_velocity_trend`
**Feeds into:** D/C Ratio, Market Saturation Engine, Hidden Gem Score

### 2. competition-analyzer
**Purpose:** Maps the competitive landscape and classifies market saturation.
**Key outputs:** `competition_score`, `market_saturation_score`, `market_saturation_label`, `avg_reviews_page1`, `brand_lock`, `new_seller_success_rate`, `active_competitor_estimate`
**Saturation labels:** Undersaturated / Healthy Competition / Competitive / Oversaturated

### 3. small-seller-success-detector
**Purpose:** Proves whether new, unfunded sellers are already winning in a niche.
**Key outputs:** `small_seller_opportunity_score`, tier breakdown (under 100 / 500 / 1,000 reviews), `review_to_revenue_efficiency`, `accessibility_verdict`, `entry_blueprint`
**Unique metric:** Review-to-Revenue Efficiency = monthly revenue ÷ review count

### 4. profit-opportunity-analyzer
**Purpose:** Full financial model — 11-item startup cost table × 3 budget scenarios.
**Key outputs:** `profit_score`, sourcing cost (low/avg/high), shipping cost (sea/air), marketplace fees, profit per unit (3 scenarios), startup budget (Conservative/Expected/Aggressive), break-even, Month 1/3/6 profit projections
**11 startup cost items:** Manufacturing, shipping, packaging, barcodes, photography, trademark, LLC, Amazon account, PPC, inventory reserve

### 5. trend-validator
**Purpose:** Trend direction, TikTok virality, brand expansion potential.
**Key outputs:** `tiktok_score` (6 dimensions), `brand_expansion_score` (4 sub-scores), `trend_direction`, `lifecycle_classification`, `seasonality_risk_score`
**TikTok dimensions:** Visual Appeal, Demonstrability, Problem/Solution Strength, UGC Potential, Organic Content Potential, Creator Friendliness
**Brand Expansion dimensions:** Upsell, Cross-Sell, Repeat Purchase, Product Line Expansion

### 6. supplier-analyzer
**Purpose:** Assesses how easy or hard it is to source the product.
**Key outputs:** `supplier_difficulty_score`, `supplier_classification` (Easy/Moderate/Difficult), `moq_flexibility`, `private_label_friendliness`, `hazmat_flag`
**Factors:** Supplier availability, manufacturer count, MOQ, PL friendliness, manufacturing complexity, QC difficulty, shipping complexity

### 7. legal-risk-analyzer
**Purpose:** Patent, trademark, brand enforcement, Amazon gating, return risk.
**Key outputs:** `patent_risk_score`, `legal_risk_score`, `return_risk_score`, `amazon_gating_level`, `brand_enforcement_risk`, `disqualification_flags`
**Auto-disqualify triggers:** patent_risk ≥ 70, return_risk ≥ 75, gating = High, brand_enforcement = High

### 8. product-validation-analyzer
**Purpose:** Determines whether the product solves a real problem customers care about.
**Key outputs:** `validation_score`, `top_customer_pain_points`, `top_product_weaknesses`, `improvement_opportunities`, `community_signal`, `social_signal`
**4 scored dimensions:** Problem Clarity, Complaint Volume, Solution Gap, Emotion Intensity
**Sources analyzed:** Amazon 1–3 star reviews, Reddit/community threads, social video discussions

### 9. launch-difficulty-analyzer
**Purpose:** How hard it is for a brand-new seller to enter and rank in this niche.
**Key outputs:** `launch_difficulty_score`, `launch_classification` (Easy/Medium/Hard), `ppc_estimates`, `review_estimates`, `time_to_rank`
**Factors:** PPC competitiveness (CPC model), review barrier, brand dominance, market entry complexity

### 10. opportunity-size-analyzer
**Purpose:** Projects how big this business can get.
**Key outputs:** `opportunity_size_score`, `business_classification`, revenue projections at 3 brand scales, `market_ceiling_annual`, `exit_value_estimate`, 36-month growth trajectory
**Business classifications:** Lifestyle Business / Small Brand / Scalable Brand / Category Leader Potential

### 11. brand-builder-agent
**Purpose:** Generates a complete brand identity for products scoring above 75.
**Key outputs:** 10 brand name ideas, positioning statement, brand story, 5 personality traits, color palette (3 colors with hex codes), voice guidelines, Product Line Expansion Map (Core → Upsell → Cross-Sell → Premium)
**Trigger condition:** `master_opportunity_score > 75` only

### 12. product-opportunity-ranker
**Purpose:** Final synthesis — computes all composite scores, applies disqualification rules, assigns 6-tier verdicts, generates all 4 output files.
**Key outputs:** Master Opportunity Score, ranked lists (Top 10, Top 5 Hidden Gems, Top 3 Low Budget, Top 3 High Margin), investment profiles, all 4 output files
**Writes:** product-opportunity-report.md, product-ranking.json, investment-analysis.md
**Confirms:** brand-builder-report.md written by Step 11

---

## All Skills (2)

### /product-hunt \<niche\>
Runs the full 12-step pipeline. Returns 4 output files.
```
/product-hunt "silicone kitchen tools"
/product-hunt "dog accessories"
/product-hunt "portable fitness gear"
```

### /find-products-under-budget \<budget\>
Filters analyzed products to those fitting within a startup budget. Adds Budget Efficiency Score. Shows near-miss products within 25% of the ceiling.
```
/find-products-under-budget 3000
/find-products-under-budget 5000
/find-products-under-budget 10000
```
**Budget Efficiency Score:** `Final Opportunity Score / (min_budget / 100)`

---

## All Scoring Formulas

### Master Opportunity Score (0–100) — Primary Ranking Signal
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
─────────────────────────────────────────────────
Total weights = 1.00
```

### Hidden Gem Score (0–100) — Rare Combination Detector
```
Trend Bonus: Rising=100 | Emerging=80 | Stable=60 | Declining=20

Hidden Gem Score =
  (demand_score                   × 0.25)
+ (competition_score              × 0.25)
+ (small_seller_opportunity_score × 0.20)
+ (profit_score                   × 0.20)
+ (Trend Bonus                    × 0.10)
```
Qualifies as Hidden Gem if: demand ≥ 55, competition ≥ 55, small_seller ≥ 55, profit ≥ 50, trend = Rising or Emerging.

### Risk Score (0–100) — Higher = More Risk
```
Risk Score =
  (patent_risk_score       × 0.30)
+ (legal_risk_score        × 0.15)
+ (seasonality_risk_score  × 0.20)
+ (return_risk_score       × 0.15)
+ (complexity_risk_score   × 0.10)
+ (supply_chain_risk_score × 0.10)
```

### Demand vs Competition (D/C) Ratio
```
D/C Ratio = demand_score / (101 − competition_score)

> 2.0  = Excellent
1.5–2.0 = Good
1.0–1.5 = Average
< 1.0   = Poor
```

### Market Saturation Score (0–100)
```
Saturation Score =
  avg_reviews_page1 contribution  (0–45 based on tier)
+ brand_lock contribution          (+20 if true)
+ active_competitor contribution   (0–15 based on count)
+ price_compression contribution   (+10 if true)
+ new_seller_success rate          (inverse contribution, 0–10)

Labels: Undersaturated (0–25) / Healthy Competition (26–50) /
        Competitive (51–75) / Oversaturated (76–100)
```

### TikTok Score (0–100) — 6 Dimensions
```
Visual Appeal          (0–20)
+ Demonstrability      (0–20)
+ Problem/Solution     (0–20)
+ UGC Potential        (0–15)
+ Organic Content      (0–15)
+ Creator Friendliness (0–10)
= TikTok Score         (0–100)
```

### Brand Expansion Score (0–100) — 4 Sub-Dimensions
```
Upsell Opportunities      (0–25)
+ Cross-Sell Opportunities (0–25)
+ Repeat Purchase          (0–25)
+ Product Line Expansion   (0–25)
= Brand Expansion Score    (0–100)
```

### Opportunity Size Score (0–100)
```
Revenue Ceiling score     (0–30)
+ Growth Trajectory score (0–25)
+ Brand Scalability score (0–25)  ← brand_expansion_score × 0.25
+ Market Accessibility    (0–20)
= Opportunity Size Score  (0–100)
```

### Supplier Difficulty Score (0–100)
```
Availability score        (0–55)
+ MOQ Flexibility score   (0–25)
+ Private Label score     (0–20)
+ Manufacturing score     (0–30)
+ QC Difficulty score     (0–25)
+ Shipping Complexity     (0–30)
= Supplier Difficulty     (0–100, cap 100)
```

### Launch Difficulty Score (0–100)
```
PPC Competitiveness  (0–25)  ← based on CPC model
+ Review Barrier     (0–20)  ← % of page-1 avg needed
+ Brand Dominance    (0–25)  ← brand lock + brand count
+ Entry Complexity   (0–30)  ← certification, gating, etc.
= Launch Difficulty  (0–100)
```

### Break-Even Formula
```
Fixed Launch Costs = Photography + PPC + Packaging + Barcodes + LLC + Misc
Break-Even Units   = Fixed Launch Costs / Net Profit Per Unit (Expected)
Break-Even Revenue = Break-Even Units × Suggested Launch Price
Break-Even Months  = Break-Even Units / Monthly Unit Sales Estimate
```

### ROI Formula (12-Month)
```
Month 1 revenue scale  = 30% of mature monthly
Month 3 revenue scale  = 60% of mature monthly
Month 6 revenue scale  = 85% of mature monthly

PPC taper:
  Month 1 = 25% of revenue
  Month 3 = 15% of revenue
  Month 6 = 10% of revenue

12-Month Cumulative Profit = sum of all months using ramp model
ROI = (12-Month Cumulative Profit / Total Investment) × 100
```

---

## Recommendation Verdicts (6 Tiers)

| Verdict | Condition |
|---------|-----------|
| 🟢 Immediate Launch | Score ≥ 82 AND Risk ≤ 45 AND Validation ≥ 70 |
| 🟢 Strong Buy | Score ≥ 72 AND Risk ≤ 60 |
| 🟡 Worth Testing | Score 58–71 |
| 🟠 Watch List | Score 42–57 OR (Score ≥ 58 AND Risk > 65) |
| 🔴 Avoid | Score < 42 |
| ⛔ Disqualified | Any hard disqualification rule triggered |

---

## Disqualification Rules (8 Hard Rules)

| # | Rule | Condition |
|---|------|-----------|
| 1 | Patent Risk | `patent_risk_score ≥ 70` |
| 2 | Dangerous Product | Chemicals, flammables, weapons, infant choking hazards |
| 3 | High Return Risk | `return_risk_score ≥ 75` |
| 4 | Marketplace Gated | `amazon_gating_level == "High"` |
| 5 | Extreme Saturation | Oversaturated label AND `competition_score ≤ 25` |
| 6 | Hazmat | Classified hazardous by carrier or marketplace |
| 7 | Brand Enforcement | `brand_enforcement_risk == "High"` |
| 8 | Adult Category | Adult/18+ gated segment |

---

## Output Files (4 Per Run)

| File | Format | Contents |
|------|--------|----------|
| `product-opportunity-report.md` | Markdown | Full 18-section professional report per product |
| `product-ranking.json` | JSON | Machine-readable ranked array with all 13 scores + financials |
| `brand-builder-report.md` | Markdown | Brand identity system for products scoring > 75 |
| `investment-analysis.md` | Markdown | Side-by-side investment profiles + risk-adjusted ROI table |

### product-opportunity-report.md — 18 Sections Per Product
1. Executive Summary
2. Master Opportunity Score Dashboard
3. Demand Analysis
4. Competition Analysis
5. Customer Validation Analysis
6. Small Seller Analysis
7. Supplier Analysis
8. Startup Budget Analysis (11 items × 3 scenarios)
9. Profit Scenarios (Conservative / Expected / Aggressive)
10. Risk Analysis
11. Launch Difficulty Analysis
12. Brand Expansion Analysis
13. TikTok Potential Analysis
14. Opportunity Size Analysis
15. Recommended Selling Price
16. Investment Recommendation (Bootstrap / Recommended / Aggressive)
17. Top 3 Reasons to Launch / Top 3 Risks
18. Final Verdict + Most Important Next Action

---

## Data Transparency — Current Limitations

**This is the most important section for production use.**

All scores produced by the current system are **reasoning-based estimates**. No live data connections exist.

| Data Type | Current Status | What's Needed |
|-----------|---------------|---------------|
| BSR / Sales Velocity | ⚠️ ESTIMATED from benchmarks | Jungle Scout / Helium 10 API |
| Review counts (page 1) | ⚠️ ESTIMATED from category knowledge | Real-time Amazon scrape or tool API |
| CPC / Keyword data | ⚠️ ESTIMATED from ad density patterns | Amazon Advertising API or Helium 10 |
| Selling prices | ⚠️ ESTIMATED from general knowledge | Amazon Product Advertising API |
| Competitor count | ⚠️ ESTIMATED from category signals | Live search result scrape |
| Manufacturing COGS | ⚠️ ESTIMATED from benchmarks | Alibaba / 1688 API or manual sourcing |
| Amazon fee schedule | ✅ VERIFIED — from published schedule | Already accurate |
| Trend direction | PARTIALLY VERIFIED — from training data | Google Trends API |
| Patent status | ⚠️ ESTIMATED — risk signal only | USPTO API or IP attorney |
| TikTok virality | PARTIALLY VERIFIED — from patterns | TikTok Research API |

**Confidence range for current outputs: 40–55 / 100**

The framework, formulas, and weights are production-ready. The input data is not yet live.

---

## APIs Planned (Roadmap)

### Priority 1 — Data Foundation
| API | Purpose | Unlocks |
|-----|---------|---------|
| **Helium 10 API** (Cerebro/Magnet) | Real keyword search volume, BSR-to-sales, CPC estimates | Demand Score, Competition Score, Launch Difficulty — all become data-verified |
| **Jungle Scout API** | Product database, monthly sales estimates, review counts | Small Seller Score, Opportunity Size — move from estimated to verified |
| **Amazon Product Advertising API** | Live pricing, product details, category data | Selling price accuracy, category classification |

### Priority 2 — Risk & Legal
| API | Purpose | Unlocks |
|-----|---------|---------|
| **USPTO Patent API** | Real-time patent search by keyword and category | Patent Risk Score becomes verified, not estimated |
| **Amazon Brand Registry API** | Check brand enrollment, enforcement activity | Brand Enforcement Risk becomes verifiable |

### Priority 3 — Trend & Social
| API | Purpose | Unlocks |
|-----|---------|---------|
| **Google Trends API** | Real search trend direction over 12–24 months | Demand velocity, seasonal patterns |
| **TikTok Research API** | Hashtag volume, video count, engagement data | TikTok Score becomes data-verified |
| **Reddit API (Pushshift)** | Community discussion volume, complaint patterns | Validation Score community signal |

### Priority 4 — Supplier
| API | Purpose | Unlocks |
|-----|---------|---------|
| **Alibaba Open Platform API** | Real MOQ, pricing, supplier count, certification status | Supplier Difficulty Score, COGS estimates |

---

## Roadmap

### v0.5.0 — Data Layer (Highest Priority)
- [ ] Helium 10 integration via hooks (Cerebro keyword data, Xray product data)
- [ ] Jungle Scout product database connector
- [ ] Amazon PA-API for live pricing
- [ ] Google Trends API for demand velocity
- [ ] Confidence score system: each metric reports its own confidence level

### v0.6.0 — Launch Automation
- [ ] PPC campaign structure generator (exact match / broad / auto)
- [ ] Amazon listing copy generator (title, bullets, description, backend keywords)
- [ ] Supplier outreach email template generator
- [ ] Sample order checklist generator

### v0.7.0 — Portfolio Intelligence
- [ ] Multi-product portfolio tracker and comparison
- [ ] Monthly P&L report generator
- [ ] Reorder point calculator and alert
- [ ] Competitor monitoring agent (tracks rank changes)

### v1.0.0 — Full Intelligence Stack
- [ ] Price elasticity analyzer
- [ ] Seasonal inventory planning calendar
- [ ] Exit readiness score (for aggregator/acquisition readiness)
- [ ] Review velocity anomaly detector
- [ ] ACoS optimizer suggestions

---

## What Was Demonstrated (2026-06-03)

A live test run was conducted analyzing 20 product ideas under $5,000 startup budget.

**Results:**
- 17 products ranked
- 3 products disqualified (LED Ring Light — saturation, Posture Corrector — patent risk, Car Phone Mount — saturation)
- 2 Strong Buy verdicts: **Pet Lick Mat (75)** and **Dog Paw Cleaner Cup (74)**
- 13 Worth Testing verdicts
- 2 Watch List verdicts

**Top 5 findings:**
| Rank | Product | Score | Startup | ROI |
|------|---------|-------|---------|-----|
| 1 | Pet Lick Mat | 75 | $2,600 | 525% |
| 2 | Dog Paw Cleaner Cup | 74 | $2,800 | 446% |
| 3 | Car Seat Gap Filler | 70 | $2,400 | 390% |
| 4 | Dog Slow Feeder Bowl | 70 | $2,700 | 390% |
| 5 | Silicone Collapsible Containers | 70 | $3,800 | 308% |

**Important caveat from transparency audit:** Average confidence 48/100. All financial figures are estimates — no live APIs connected. The ranking is directionally valid; all specific numbers require validation with Helium 10 / Jungle Scout before acting.

---

## Production Readiness Assessment

| Component | Status | Notes |
|-----------|--------|-------|
| Plugin structure | ✅ Complete | All required dirs present, plugin.json valid |
| Agent coverage | ✅ Complete | 12 agents, zero gaps in pipeline |
| Skill commands | ✅ Complete | 2 skills operational |
| Scoring formulas | ✅ Complete | All 9 formulas defined, weights sum to 1.00 |
| Disqualification engine | ✅ Complete | 8 hard rules |
| Output file specs | ✅ Complete | 4 files, 18-section report defined |
| Recommendation engine | ✅ Complete | 6-tier system |
| Brand builder | ✅ Complete | Conditional on score > 75 |
| Investment analysis | ✅ Complete | 3 profiles + risk-adjusted ROI |
| Git + GitHub | ✅ Live | Pushed, synced |
| README | ✅ Complete | Full documentation |
| **Live data connections** | ❌ Not built | All scores are estimates until APIs connected |
| **Real-time BSR data** | ❌ Not built | Requires Helium 10 or Jungle Scout |
| **Verified patent search** | ❌ Not built | Requires USPTO API |

**Framework verdict: Production-ready.**
**Data layer verdict: Not production-ready — all outputs are estimates until v0.5.0 APIs are connected.**

---

## Quick Reference — Total Files on Disk

| File | Type |
|------|------|
| `.claude-plugin/plugin.json` | Plugin manifest |
| `.claude-plugin/skills/product-hunt/SKILL.md` | Primary research command |
| `.claude-plugin/skills/find-products-under-budget/SKILL.md` | Budget filter command |
| `.claude-plugin/agents/amazon-demand-analyzer/AGENT.md` | Step 1 |
| `.claude-plugin/agents/competition-analyzer/AGENT.md` | Step 2 |
| `.claude-plugin/agents/small-seller-success-detector/AGENT.md` | Step 3 |
| `.claude-plugin/agents/profit-opportunity-analyzer/AGENT.md` | Step 4 |
| `.claude-plugin/agents/trend-validator/AGENT.md` | Step 5 |
| `.claude-plugin/agents/supplier-analyzer/AGENT.md` | Step 6 |
| `.claude-plugin/agents/legal-risk-analyzer/AGENT.md` | Step 7 |
| `.claude-plugin/agents/product-validation-analyzer/AGENT.md` | Step 8 |
| `.claude-plugin/agents/launch-difficulty-analyzer/AGENT.md` | Step 9 |
| `.claude-plugin/agents/opportunity-size-analyzer/AGENT.md` | Step 10 |
| `.claude-plugin/agents/brand-builder-agent/AGENT.md` | Step 11 |
| `.claude-plugin/agents/product-opportunity-ranker/AGENT.md` | Step 12 |
| `.gitignore` | Git config |
| `README.md` | Full documentation |
| `PROJECT_STATUS.md` | This file |
| `product-ranking.json` | Live analysis output |
