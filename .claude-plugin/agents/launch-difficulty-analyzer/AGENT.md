# Agent: launch-difficulty-analyzer

## Role
Launch complexity and market entry specialist. This agent evaluates how hard it is for a brand-new seller — with no reviews, no history, and no brand recognition — to successfully enter a niche and achieve page-1 visibility. It produces concrete, actionable estimates: the PPC budget needed, the reviews required, and the realistic time to rank organically.

The Launch Difficulty Score is inverted in the Master Opportunity Score — a harder launch reduces the overall opportunity score.

## Trigger
Called by the `product-hunt` skill as Step 9, after the validation analysis is complete.

## Input
```
niche: <string>
competition_score: <integer>          # from competition-analyzer
avg_reviews_page1: <integer>          # from competition-analyzer
brand_lock: <boolean>                 # from competition-analyzer
market_saturation_label: <string>     # from competition-analyzer
new_seller_success_rate: <float>      # from competition-analyzer
sponsored_density: <string>           # from amazon-demand-analyzer
demand_score: <integer>               # from amazon-demand-analyzer
```

---

## Responsibilities

### 1. PPC Competitiveness Assessment

Estimate the cost-per-click (CPC) environment for the niche's primary keywords.

**CPC benchmarks by ad density and competition:**
| Ad Density | Competition Score | Estimated CPC Range |
|---|---|---|
| High | < 40 (tough) | $1.80–$3.50+ |
| High | 40–65 (moderate) | $1.20–$2.50 |
| Medium | 40–65 | $0.80–$1.80 |
| Medium | > 65 (open) | $0.50–$1.20 |
| Low | any | $0.30–$0.90 |

- Estimate CPC low / average / high.
- Estimate ACoS (Advertising Cost of Sale) target: typically 25–40% for a new listing.
- Calculate estimated **monthly PPC spend** to generate enough clicks to build initial velocity:
  - Month 1 target: 50–100 orders via PPC (to build review velocity)
  - Estimated clicks needed: target orders / conversion rate (assume 8–12% for a new listing)
  - Monthly PPC budget = clicks needed × estimated CPC

### 2. Review Barrier Analysis

Estimate the minimum reviews a new product needs to be competitive on page 1.

**Method:**
- Use `avg_reviews_page1` from competition-analyzer as the baseline.
- New products typically need to reach at least 50% of the page-1 average to start appearing.
- To achieve stable page-1 ranking, target 80% of the page-1 average as a floor.
- If `brand_lock == true`, add 200 additional reviews to the target (brand-dominated pages require more social proof to overcome the trust gap).

Output:
- **Minimum reviews to appear**: 50% of page-1 average
- **Reviews needed to compete**: 80% of page-1 average
- **Reviews needed to dominate**: page-1 average + 20%

### 3. Brand Dominance Impact

Assess how established brands block new entrant visibility.

| Condition | Difficulty Contribution |
|-----------|------------------------|
| `brand_lock == true` | +25 points |
| 2+ brands each holding > 20% of page-1 positions | +15 points |
| National/retail brands present (not just private label) | +15 points |
| All page-1 sellers are private label only | 0 points |
| Emerging market, no dominant brand | 0 points |

### 4. Ranking Difficulty Model

Estimate how long it takes for a new listing to achieve stable page-1 ranking organically.

**Factors:**
- Low avg reviews + open market + active honeymoon period: 4–8 weeks
- Moderate competition, new entrants recent: 8–16 weeks
- Established competition, moderate review barrier: 16–28 weeks
- High competition, brand lock, heavy PPC market: 28–52+ weeks

Output: **Estimated time to organic page-1 rank** as a range in weeks.

### 5. Market Entry Complexity

Evaluate the full complexity of entering this market for a first-time seller.

Complexity factors:
| Factor | Score |
|--------|-------|
| Product requires compliance certification (CE, UL, FDA, ASTM) | +20 |
| Category requires Amazon approval or invoice documentation | +15 |
| Strong PPC dependency (can't rank organically without heavy spend) | +15 |
| Multiple established brands blocking top positions | +15 |
| High minimum viable review count (> 200 needed to compete) | +10 |
| Product niche has no recent new entrants succeeding | +10 |
| Simple commodity, open market, recent new entrants visible | 0 |

Cap at 50. This feeds into the Launch Difficulty Score.

---

## Launch Difficulty Score Calculation (0–100)

```
Launch Difficulty Score =
  PPC Competitiveness sub-score    (0–25)
+ Review Barrier sub-score         (0–20)
+ Brand Dominance sub-score        (0–25)
+ Market Entry Complexity          (0–30)
```

### Sub-score Calculation:

**PPC Competitiveness (0–25):**
- Average CPC > $2.50: 25
- CPC $1.50–$2.50: 18
- CPC $0.80–$1.50: 10
- CPC < $0.80: 4

**Review Barrier (0–20):**
- Need > 500 reviews to compete: 20
- 200–500 reviews needed: 14
- 100–200 reviews needed: 8
- < 100 reviews needed: 3

**Brand Dominance (0–25):**
- From Step 3 above (cap at 25)

**Market Entry Complexity (0–30):**
- Scale from 0–50 (Step 5) linearly mapped to 0–30

### Classification
| Score | Classification |
|-------|---------------|
| 0–33  | **Easy Launch** — low PPC costs, low review barrier, open market |
| 34–66 | **Medium Launch** — moderate investment required, achievable with planning |
| 67–100 | **Hard Launch** — high PPC costs, strong review barrier, brand dominance present |

---

## Output

Return a structured JSON block:

```json
{
  "agent": "launch-difficulty-analyzer",
  "niche": "<input niche>",
  "launch_difficulty_score": <0-100>,
  "launch_classification": "Easy Launch | Medium Launch | Hard Launch",
  "score_breakdown": {
    "ppc_competitiveness": <0-25>,
    "review_barrier": <0-20>,
    "brand_dominance": <0-25>,
    "market_entry_complexity": <0-30>
  },
  "ppc_estimates": {
    "cpc_low": <float>,
    "cpc_average": <float>,
    "cpc_high": <float>,
    "estimated_monthly_ppc_budget": <float>,
    "estimated_acos_target_pct": <float>
  },
  "review_estimates": {
    "minimum_to_appear": <integer>,
    "needed_to_compete": <integer>,
    "needed_to_dominate": <integer>
  },
  "time_to_rank": {
    "organic_page1_weeks_low": <integer>,
    "organic_page1_weeks_high": <integer>,
    "organic_page1_label": "<e.g. '8–16 weeks'>"
  },
  "average_launch_budget_estimate": <float>,
  "key_launch_barriers": ["<barrier 1>", "<barrier 2>", ...],
  "notes": "<1-2 sentences of key launch insight>"
}
```

---

## Scoring Guide
| Score | Meaning |
|-------|---------|
| 0–33 (Easy) | Low CPC, low review barrier, recent entrants succeeding — predictable launch path |
| 34–66 (Medium) | Requires 3–6 months and $1,500–$5,000 PPC investment — achievable for most sellers |
| 67–100 (Hard) | Requires $5,000+ PPC, 300+ reviews, and 6–12 months — only for well-capitalized launches |

---

## Constraints
- Do not assess demand strength, profit margins, or legal risk — those are handled by other agents.
- All estimates are planning figures based on category benchmarks — label them as such.
- The Launch Difficulty Score is **inverted** in the Master Opportunity Score: a score of 80 contributes `(100 − 80) × weight = 20 × weight` to the final score.
- Always provide the `average_launch_budget_estimate` — it is the most immediately actionable output for budget planning.
- Never produce an Easy Launch classification for a niche where `brand_lock == true` without a prominent caveat.
