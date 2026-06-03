# Amazon Opportunity Hunter

**Amazon Product Opportunity Intelligence System — Claude Code Plugin v0.4.0**

A complete product research intelligence system built as a Claude Code plugin. It runs a 12-agent pipeline to find, score, rank, and validate Amazon product opportunities — then delivers professional-grade reports with startup budgets, profit projections, brand identity, and investment recommendations.

**The goal:** Identify products with real customer demand, beatable competition, strong margins, low legal risk, strong brand potential, and long-term scalability — ranked by probability of building a successful Amazon brand.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Skills (Commands)](#skills-commands)
- [The 12-Agent Pipeline](#the-12-agent-pipeline)
- [Scoring Methodology](#scoring-methodology)
- [Analysis Modules](#analysis-modules)
- [Recommendation Verdicts](#recommendation-verdicts)
- [Disqualification Rules](#disqualification-rules)
- [Output Files](#output-files)
- [Example Commands](#example-commands)
- [Example Output](#example-output)
- [Capability Checklist](#capability-checklist)
- [Roadmap](#roadmap)

---

## How It Works

You run a single command. The plugin fires 12 specialized agents in sequence — each one building on the last — and produces four output files: a full professional report, a machine-readable JSON ranking, a brand identity document, and an investment analysis.

```
/product-hunt "silicone kitchen tools"
```

What happens next:

```
Step  1  →  amazon-demand-analyzer         Demand signals, BSR, ad density, review velocity
Step  2  →  competition-analyzer           Market saturation, review distribution, brand lock
Step  3  →  small-seller-success-detector  3-tier small seller analysis, market share by tier
Step  4  →  profit-opportunity-analyzer    11-item startup budget × 3 scenarios, break-even
Step  5  →  trend-validator               TikTok score (6D), Brand Expansion score (4D)
Step  6  →  supplier-analyzer             Supplier difficulty, MOQ, PL friendliness
Step  7  →  legal-risk-analyzer           Patent risk, trademark, gating, return risk
Step  8  →  product-validation-analyzer   Review sentiment, pain points, solution gaps
Step  9  →  launch-difficulty-analyzer    PPC costs, review barrier, time to rank
Step 10  →  opportunity-size-analyzer     Market ceiling, 36-month revenue trajectory
Step 11  →  brand-builder-agent           Brand identity for products scoring > 75
Step 12  →  product-opportunity-ranker    Master Score, verdicts, 4 output files
```

---

## Skills (Commands)

### `/product-hunt <niche>`

Runs the complete 12-step pipeline against a niche keyword.

```bash
/product-hunt "silicone ice cube trays"
/product-hunt "portable blenders"
/product-hunt "weighted blankets"
/product-hunt "dog slow feeder bowls"
```

**Output:** Four files written to your working directory — full report, JSON ranking, brand builder report, investment analysis.

---

### `/find-products-under-budget <budget>`

Filters all analyzed products to those whose minimum startup budget fits within the specified amount. Adds a Budget Efficiency Score and shows near-miss products just above the ceiling.

```bash
/find-products-under-budget 3000
/find-products-under-budget 5000
/find-products-under-budget 10000
```

**Budget tiers:**
| Budget | Tier | Expected Pool |
|--------|------|--------------|
| < $1,000 | Micro | Simple commodity products only |
| $1,000–$2,499 | Starter | Solid private-label options |
| $2,500–$4,999 | Growth | Most mid-range opportunities |
| $5,000–$9,999 | Established | High-margin and brand-building products |
| $10,000+ | Serious | Full range including higher-risk/reward |

---

## The 12-Agent Pipeline

| Step | Agent | Sole Responsibility |
|------|-------|-------------------|
| 1 | `amazon-demand-analyzer` | BSR signals, autocomplete volume, ad density, review velocity, demand depth |
| 2 | `competition-analyzer` | Page-1 review distribution, brand lock, active competitor count, market saturation engine |
| 3 | `small-seller-success-detector` | Three-tier analysis (< 100 / < 500 / < 1,000 reviews), monthly sales per tier, Review-to-Revenue Efficiency |
| 4 | `profit-opportunity-analyzer` | 11-item startup cost table across 3 budget scenarios, per-unit profit model, Month 1/3/6 projections |
| 5 | `trend-validator` | TikTok virality (6 dimensions), Brand Expansion score (4 sub-dimensions), lifecycle classification |
| 6 | `supplier-analyzer` | Supplier availability, MOQ flexibility, private-label friendliness, QC difficulty, shipping complexity |
| 7 | `legal-risk-analyzer` | Utility patents, design patents, trademark risk, brand enforcement, Amazon gating, return risk |
| 8 | `product-validation-analyzer` | Review sentiment mining, Reddit/community signals, social video signals, solution gap analysis |
| 9 | `launch-difficulty-analyzer` | CPC estimates, review barrier, brand dominance impact, time-to-organic-rank |
| 10 | `opportunity-size-analyzer` | Market ceiling, Small/Medium/Large brand revenue projections, exit value, 36-month trajectory |
| 11 | `brand-builder-agent` | Brand names, positioning, story, personality, colors, voice, Product Line Expansion Map |
| 12 | `product-opportunity-ranker` | Master Score, 6-tier verdicts, 4 ranked lists, 3 investment profiles, 4 output files |

---

## Scoring Methodology

### Master Opportunity Score (0–100)

The primary ranking signal. Weighted sum of 13 inputs:

| Input | Weight | Direction |
|-------|--------|-----------|
| Demand Score | 15% | Higher = better |
| Competition Score | 12% | Higher = less competition = better |
| Profit Score | 12% | Higher = better |
| Small Seller Opportunity Score | 12% | Higher = better |
| Validation Score | 10% | Higher = better |
| Opportunity Size Score | 10% | Higher = better |
| Hidden Gem Score | 8% | Higher = better |
| Brand Expansion Score | 7% | Higher = better |
| Launch Difficulty Score | 6% | **Inverted** — lower difficulty = better |
| Patent Risk Score | 5% | **Inverted** — lower risk = better |
| Return Risk Score | 1% | **Inverted** — lower risk = better |
| TikTok Score | 1% | Higher = better |
| Supplier Difficulty Score | 1% | **Inverted** — easier sourcing = better |

---

### Hidden Gem Score (0–100)

Rewards the rare combination of high demand AND low competition AND small-seller proof AND strong margins AND growth momentum — all four simultaneously.

```
Hidden Gem Score =
  (Demand Score                    × 0.25)
+ (Competition Score               × 0.25)
+ (Small Seller Opportunity Score  × 0.20)
+ (Profit Score                    × 0.20)
+ (Trend Bonus                     × 0.10)

Trend Bonus: Rising=100 | Emerging=80 | Stable=60 | Declining=20
```

---

### Risk Score (0–100)

Higher = more risk. Used inverted in the Master Score and as a recommendation override.

```
Risk Score =
  (Patent Risk Score       × 0.30)
+ (Legal Risk Score        × 0.15)
+ (Seasonality Risk Score  × 0.20)
+ (Return Risk Score       × 0.15)
+ (Complexity Risk Score   × 0.10)
+ (Supply Chain Risk Score × 0.10)
```

---

### Demand vs Competition (D/C) Ratio

```
D/C Ratio = Demand Score ÷ (101 − Competition Score)
```

| Value | Classification |
|-------|---------------|
| > 2.0 | Excellent |
| 1.5–2.0 | Good |
| 1.0–1.5 | Average |
| < 1.0 | Poor |

---

## Analysis Modules

### Demand Analysis

**Agent:** `amazon-demand-analyzer`

Measures how strongly the market wants a given product using structural signals rather than relying solely on reported search volumes.

Signals analyzed:
- **BSR (Best Seller Rank)** of top 5 products — lower = higher velocity
- **Autocomplete variant count** — more variants = broader, deeper demand
- **Sponsored placement density** — high ad density confirms profitable demand
- **Frequently Bought Together** activity — repeat-buying signal
- **Review velocity** — reviews per month as a sales proxy
- **Demand depth** — Shallow / Moderate / Deep (concentrated vs. distributed demand)
- **Demand velocity trend** — Accelerating / Stable / Decelerating

**Outputs:** `demand_score` (0–100), classification (Evergreen / Seasonal / Trending / Declining), `total_sellers_estimate` for D/C Ratio.

---

### Competition Analysis & Market Saturation Engine

**Agent:** `competition-analyzer`

Maps the competitive landscape and classifies market saturation using a composite scoring formula.

Saturation factors:
- Average review count on page 1
- Brand lock (single brand holding ≥ 3 top-10 positions)
- Active competitor count with recent BSR activity
- Price compression (tight price band = race-to-the-bottom)
- New seller success rate (% of page-1 listings launched < 12 months ago)

**Market Saturation Classifications:**
| Label | Meaning |
|-------|---------|
| Undersaturated | Open market — early entry advantage available |
| Healthy Competition | Normal landscape — skill and differentiation win |
| Competitive | Established players — differentiation + PPC required |
| Oversaturated | Locked — avoid unless disruptive angle exists |

**Outputs:** `competition_score` (0–100, higher = less competition), `market_saturation_score`, `market_saturation_label`, `new_seller_success_rate`.

---

### Small Seller Success Detection

**Agent:** `small-seller-success-detector`

The most important market accessibility signal. Identifies whether new, unfunded sellers are already winning — proving the market does not require massive scale or thousands of reviews to compete.

**Three-Tier Analysis:**
| Tier | Sellers Found | Monthly Sales | Market Share |
|------|--------------|---------------|-------------|
| Under 100 reviews | X | ~XXX units/mo | ~X% |
| Under 500 reviews | X | ~XXX units/mo | ~X% |
| Under 1,000 reviews | X | ~XXX units/mo | ~X% |

**Review-to-Revenue Efficiency:** Monthly revenue ÷ review count. A high ratio means the algorithm rewards new listings — the niche has not been review-gated yet.

**Accessibility Verdicts:** Highly Accessible / Accessible / Hard to Enter / Locked

**Entry Blueprint:** The dominant differentiation pattern that small winners used — the replication strategy the user can copy.

**Output:** `small_seller_opportunity_score` (0–100).

---

### Hidden Gem Detection

**Computed by:** `product-opportunity-ranker` using outputs from all upstream agents.

A Hidden Gem must satisfy all four conditions simultaneously:
1. High demand (`demand_score ≥ 55`)
2. Low competition (`competition_score ≥ 55`)
3. Small sellers winning (`small_seller_opportunity_score ≥ 55`)
4. Strong margins (`profit_score ≥ 50`)
5. Growing trend (Rising or Emerging)

Products meeting all five are flagged in the **Top 5 Hidden Gems** ranked list.

---

### Patent & Legal Risk Analysis

**Agent:** `legal-risk-analyzer`

Three independent risk scores:

**Patent Risk Score (0–100):**
- Utility patent risk (functional inventions) — 0–50 sub-score
- Design patent risk (aesthetic protection) — 0–30 sub-score
- `patent_risk_score ≥ 70` → automatic ⛔ Disqualification

**Legal Risk Score (0–100):**
- Trademark risk (registered marks in category)
- Brand enforcement risk (active IP takedown activity)
- Amazon gating risk (pre-approval required)
- `amazon_gating_level == "High"` → automatic ⛔ Disqualification

**Classifications:** Low / Medium / High for each score independently.

> ⚠️ All patent and trademark assessments are risk signals, not legal opinions. Consult a qualified IP attorney before launch.

---

### Return Rate Risk Analysis

**Agent:** `legal-risk-analyzer`

Estimates the probability of elevated returns, defects, and customer complaints.

Return drivers scored:
- Fit/size variance (clothing, shoes, accessories) +25
- Color/appearance mismatch risk +20
- Technical setup complexity +20
- Fragile in transit +15
- High customer expectation gap +20
- Regulated product claims +15
- Simple commodity with consistent specs −20

`return_risk_score ≥ 75` → automatic ⛔ Disqualification.

---

### Profit Opportunity Analysis

**Agent:** `profit-opportunity-analyzer`

Full financial model across three budget scenarios.

**11-Item Startup Cost Table:**
| Cost Item | Conservative | Expected | Aggressive |
|-----------|-------------|---------|------------|
| Manufacturing (MOQ) | 200 units | 500 units | 1,000 units |
| Inbound Shipping | Sea | Sea | Air (first run) |
| Packaging | Poly bag | Custom box + insert | Premium printed |
| Barcodes | $30 | $50 | $250 |
| Product Photography | $200 | $500 | $900 |
| Trademark | Deferred | Deferred | $350 |
| LLC Setup | $0 | $150 | $450 |
| Amazon Account | $40/mo | $40/mo | $40/mo |
| PPC Launch Budget | $300 | $900 | $2,000 |
| Inventory Reserve | None | 50 units | 200 units |

**Three Profit Scenarios:** Conservative / Expected / Aggressive — each with selling price, net profit per unit, and margin %.

**Profit Projections:** Month 1 (30% velocity), Month 3 (60%), Month 6 (85%) with PPC taper model.

**Break-Even:** Units needed, revenue needed, months to break even.

---

### Customer Validation Analysis

**Agent:** `product-validation-analyzer`

Answers: *Does this product solve a real problem customers actively care about?*

Four scored dimensions (0–25 each):
1. **Problem Clarity** — Can the pain be stated in one sentence?
2. **Complaint Volume** — How vocal and numerous are complainers?
3. **Solution Gap** — How poorly do existing products solve it?
4. **Customer Emotion Intensity** — How strongly do customers feel the pain?

Sources analyzed: Amazon 1–3 star reviews, Reddit/community threads, social video discussions.

**Outputs:**
- `validation_score` (0–100)
- Top 5 Customer Pain Points
- Top Product Weaknesses
- Improvement Opportunities (with impact + difficulty ratings)
- Validation Verdict

**Classifications:** Weak Validation / Moderate Validation / Strong Validation

---

### TikTok Viral Potential Analysis

**Agent:** `trend-validator`

Scores short-form video virality across six dimensions:

| Dimension | Max Score |
|-----------|-----------|
| Visual Appeal | 20 |
| Demonstrability | 20 |
| Problem/Solution Strength | 20 |
| UGC Potential | 15 |
| Organic Content Potential | 15 |
| Creator Friendliness | 10 |
| **Total TikTok Score** | **100** |

A high TikTok Score means the product can acquire customers organically through content — reducing paid acquisition dependency over time.

---

### Brand Expansion Analysis

**Agent:** `trend-validator`

Scores the long-term brand-building potential across four sub-dimensions (0–25 each):

| Sub-Dimension | What It Measures |
|---------------|----------------|
| Upsell Opportunities | Premium versions, accessories, add-ons |
| Cross-Sell Opportunities | Complementary products customers always buy together |
| Repeat Purchase Potential | Consumable/replacement cycle frequency |
| Product Line Expansion | Natural adjacent product families |

**Brand Expansion Score = sum of all four (0–100).**

Products scoring above 70 have the potential to grow from a single SKU into a multi-product brand with meaningful exit value.

---

### Opportunity Size Estimation

**Agent:** `opportunity-size-analyzer`

Projects revenue potential at three brand-scale levels and classifies the long-term business opportunity.

**Revenue Projections:**
| Scale | Market Share | Monthly Revenue | Annual Revenue |
|-------|-------------|----------------|----------------|
| Small Brand | ~2% | $XX,XXX | $XXX,XXX |
| Medium Brand | ~7.5% | $XX,XXX | $X,XXX,XXX |
| Large Brand | ~17.5% | $XX,XXX | $X,XXX,XXX |
| Market Ceiling | 20% cap | — | $X,XXX,XXX |

**Business Classifications:**
| Classification | Annual Revenue | Notes |
|---|---|---|
| Lifestyle Business | $60K–$240K | Supplemental income ceiling |
| Small Brand | $240K–$1.2M | Full-time, one operator |
| Scalable Brand | $1.2M–$6M | Requires team; strong exit value |
| Category Leader Potential | $6M+ | Acquisition target for aggregators |

**Exit Value Estimate:** 2–4× annual net profit (industry standard e-commerce multiple).

---

### Investment Recommendations

**Computed by:** `product-opportunity-ranker`

Three investment profiles per product:

| Profile | MOQ | Approach | Best For |
|---------|-----|----------|---------|
| Bootstrap | 200 units | Minimum viable test | First-time sellers, capital-light validation |
| Recommended | 500 units | Balanced risk/reward | Sellers with some capital, growth focus |
| Aggressive | 1,000 units | Fast rank push | Well-capitalized, want to dominate quickly |

Each profile includes: **Total Investment**, **Expected 12-Month ROI**, **Payback Period**, **Break-Even Timeline**.

**Risk-Adjusted ROI** ranks all products by `Expected ROI × (1 - risk_score/100)` — the true comparison after accounting for downside risk.

---

## Recommendation Verdicts

Six-tier system from Immediate Launch to Disqualified:

| Verdict | Condition |
|---------|-----------|
| 🟢 **Immediate Launch** | Score ≥ 82 AND Risk ≤ 45 AND Validation ≥ 70 |
| 🟢 **Strong Buy** | Score ≥ 72 AND Risk ≤ 60 |
| 🟡 **Worth Testing** | Score 58–71 |
| 🟠 **Watch List** | Score 42–57 OR high risk override |
| 🔴 **Avoid** | Score < 42 |
| ⛔ **Disqualified** | Any hard disqualification rule triggered |

Every product also receives:
- **Top 3 Reasons to Launch**
- **Top 3 Risks**
- **Most Important Next Action** (7-day action item)

---

## Disqualification Rules

Eight hard rules. Any single trigger = ⛔ Disqualified, regardless of opportunity score.

| # | Rule | Condition |
|---|------|-----------|
| 1 | Patent Risk | `patent_risk_score ≥ 70` |
| 2 | Dangerous Product | Chemicals, flammables, weapons, infant choking hazards |
| 3 | High Return Risk | `return_risk_score ≥ 75` |
| 4 | Marketplace Gated | Amazon pre-approval required (High level) |
| 5 | Extreme Saturation | Oversaturated market AND `competition_score ≤ 25` |
| 6 | Hazmat | Classified hazardous by carrier or marketplace |
| 7 | Brand Enforcement | Active IP enforcement in category (High level) |
| 8 | Adult Category | Adult/18+ gated segment |

Disqualified products are never silently removed — they appear in a dedicated table in every report with the specific triggered rule.

---

## Output Files

Four files written to your working directory after every `/product-hunt` run:

| File | Format | Contents |
|------|--------|----------|
| `product-opportunity-report.md` | Markdown | Full 18-section professional report per product: Executive Summary, all 13 scores, full financial tables, risk breakdown, brand analysis, 3 investment profiles, Top 3 reasons to launch, Top 3 risks, Final Verdict |
| `product-ranking.json` | JSON | Machine-readable ranked array with all 13 scores, financials, and metadata for every evaluated product |
| `brand-builder-report.md` | Markdown | Brand identity system for products scoring > 75: 10 name ideas, positioning statement, brand story, 5 personality traits, color palette with hex codes, voice guidelines, Product Line Expansion Map |
| `investment-analysis.md` | Markdown | Side-by-side investment comparison for all ranked products including Bootstrap/Recommended/Aggressive profiles, risk-adjusted ROI table, and capital allocation advice |

---

## Example Commands

```bash
# Research a niche from scratch
/product-hunt "bamboo cutting boards"

# Budget-constrained research
/find-products-under-budget 2500

# Research with a specific keyword variant
/product-hunt "portable protein shaker bottles"

# Research a trending category
/product-hunt "dog enrichment toys"
```

---

## Example Output

### Product Report Excerpt

```
## [#1] Collapsible Silicone Food Storage Containers

### Master Opportunity Score Dashboard
| Metric                      | Score     | Classification          |
|-----------------------------|-----------|-------------------------|
| Master Opportunity Score    | 79 / 100  | —                       |
| Demand Score                | 82 / 100  | Strong                  |
| Competition Score           | 71 / 100  | Moderate                |
| Small Seller Opportunity    | 78 / 100  | Accessible              |
| Profit Score                | 74 / 100  | Healthy                 |
| Validation Score            | 81 / 100  | Strong Validation       |
| Opportunity Size Score      | 68 / 100  | Scalable Brand          |
| Hidden Gem Score            | 76 / 100  | —                       |
| Brand Expansion Score       | 72 / 100  | —                       |
| TikTok Score                | 80 / 100  | Highly Viral-Ready      |
| Risk Score                  | 28 / 100  | Low                     |
| Launch Difficulty Score     | 41 / 100  | Medium Launch           |
| Supplier Difficulty Score   | 22 / 100  | Easy                    |
| D/C Ratio                   | 2.83      | Excellent               |
| Market Saturation           | —         | Healthy Competition     |

### Startup Budget
| Item                  | Bootstrap | Recommended | Aggressive |
|-----------------------|-----------|-------------|------------|
| Manufacturing         | $380      | $1,750      | $4,200     |
| Shipping              | $90       | $420        | $800       |
| Packaging             | $40       | $300        | $1,000     |
| Photography           | $200      | $500        | $900       |
| PPC Launch            | $300      | $900        | $2,000     |
| Miscellaneous         | $200      | $400        | $700       |
| TOTAL                 | $1,210    | $4,270      | $9,600     |

### Investment Profiles
| Profile     | Investment | ROI (12mo) | Payback  |
|-------------|-----------|------------|----------|
| Bootstrap   | $1,210    | 187%       | 3 months |
| Recommended | $4,270    | 224%       | 4 months |
| Aggressive  | $9,600    | 198%       | 5 months |

### Final Verdict
🟢 Strong Buy

> Strong demand signal with excellent D/C Ratio of 2.83. Small sellers with 40–80 reviews
> are ranking on page 1 — market is genuinely accessible. Margins support a 4-month
> payback on the Recommended budget. Primary risk: the category attracts frequent new
> entrants, so launch velocity matters. Move fast on review generation in months 1–2.

Most Important Next Action:
> Order 3 product samples from 3 different suppliers this week.
> Compare quality, packaging flexibility, and MOQ terms before committing to inventory.
```

---

## Capability Checklist

| Capability | Agent | Status |
|-----------|-------|--------|
| Amazon Demand Analyzer | `amazon-demand-analyzer` | ✅ |
| Competition Analyzer | `competition-analyzer` | ✅ |
| Market Saturation Engine | `competition-analyzer` | ✅ |
| Small Seller Success Detector | `small-seller-success-detector` | ✅ |
| Hidden Gem Detector | `product-opportunity-ranker` | ✅ |
| Patent & Legal Risk Analyzer | `legal-risk-analyzer` | ✅ |
| Return Rate Risk Analyzer | `legal-risk-analyzer` | ✅ |
| Profit Opportunity Analyzer | `profit-opportunity-analyzer` | ✅ |
| Startup Cost Estimator (11 items × 3 scenarios) | `profit-opportunity-analyzer` | ✅ |
| Supplier Difficulty Score | `supplier-analyzer` | ✅ |
| Customer Validation Analyzer | `product-validation-analyzer` | ✅ |
| Launch Difficulty Analyzer | `launch-difficulty-analyzer` | ✅ |
| TikTok Virality Analyzer | `trend-validator` | ✅ |
| Brand Expansion Analyzer | `trend-validator` | ✅ |
| Opportunity Size Estimator | `opportunity-size-analyzer` | ✅ |
| AI Brand Builder | `brand-builder-agent` | ✅ |
| Investment Recommendation Engine | `product-opportunity-ranker` | ✅ |
| Product Opportunity Ranker | `product-opportunity-ranker` | ✅ |
| 6-Tier Recommendation Verdicts | `product-opportunity-ranker` | ✅ |
| 8-Rule Disqualification Engine | `product-opportunity-ranker` | ✅ |
| D/C Ratio | `product-opportunity-ranker` | ✅ |
| Master Opportunity Score (13 inputs) | `product-opportunity-ranker` | ✅ |
| Budget-Filtered Search | `find-products-under-budget` | ✅ |
| product-opportunity-report.md | `product-opportunity-ranker` | ✅ |
| product-ranking.json | `product-opportunity-ranker` | ✅ |
| brand-builder-report.md | `brand-builder-agent` | ✅ |
| investment-analysis.md | `product-opportunity-ranker` | ✅ |

---

## Project Structure

```
.claude-plugin/
├── plugin.json                              # Plugin manifest v0.4.0
│
├── agents/                                  # 12 specialized agents
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
├── hooks/                                   # Reserved for automation hooks
├── references/                              # Reserved for reference documents
│
└── skills/                                  # 2 user-facing commands
    ├── product-hunt/SKILL.md
    └── find-products-under-budget/SKILL.md
```

---

## Roadmap

### v0.5.0 — Data Enrichment
- [ ] Helium 10 / Jungle Scout data integration via API hooks
- [ ] Google Trends signal integration
- [ ] Real-time BSR data connector

### v0.6.0 — Launch Automation
- [ ] PPC campaign structure generator
- [ ] Listing copy generator (title, bullets, description)
- [ ] Supplier outreach email templates

### v0.7.0 — Portfolio Management
- [ ] Multi-product portfolio tracker
- [ ] Monthly P&L report generator
- [ ] Reorder alert system

### v1.0.0 — Full Stack
- [ ] Competitor monitoring agent
- [ ] Price elasticity analyzer
- [ ] Seasonal inventory planning calendar
- [ ] Exit readiness score

---

## Requirements

- [Claude Code](https://claude.ai/code) (CLI or IDE extension)
- Claude Sonnet 4.6 or higher recommended for full pipeline execution
- No external APIs required — all analysis is reasoning-based using public signals

---

## License

MIT License — use freely, modify freely, build on it.
