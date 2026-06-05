# V4 SCORING ENGINE — SPECIFICATION
**Version:** 4.0.0
**Last Updated:** 2026-06-04

---

## Final Opportunity Score Formula

```
base_score (0–100) =
    demand_score            × 0.25
  + new_seller_score        × 0.20
  + listing_weakness_score  × 0.15
  + trend_intelligence_score × 0.15
  + market_saturation_score × 0.10
  + brand_expansion_score   × 0.10
  + review_integrity_score  × 0.05
  ─────────────────────────────────
  weights sum               = 1.00

opportunity_gap_bonus = +10  if trend is growing externally faster than Amazon
                      =  0   otherwise

final_score = min(100, base_score + opportunity_gap_bonus)
```

Components 1–6 (demand through brand_expansion) are inherited from V3 unchanged.
Component 7 (review_integrity) is inherited from V3 and acts as a REJECT gate.
Component 8 (trend_intelligence) replaces V3's trend_velocity with anti-hype dampening.
The opportunity_gap is an additional bonus, not a weighted component.

---

## Component 8 — TREND INTELLIGENCE SCORE (15%)

**Question answered:** Is demand accelerating outside Amazon across multiple independent signals?

**Data sources:** Google Trends, TikTok, Reddit, Pinterest, Etsy (all stubs in V4.0)

### Step 1: Gather Raw Signals

Each source returns a `TrendSignal` or `None` (if stub or unavailable).

A `TrendSignal` contains:
- `trend_score` — 0–100 (primary score for this source)
- `momentum_30d`, `momentum_90d` — acceleration signals
- `stability_12m` — long-term staying power
- `engagement_ratio` — (likes+comments) / views (anti-hype signal)
- `creator_diversity` — 0–100 (100 = many independent creators)
- `search_correlation` — correlation between social signal and search queries
- `community_signal` — organic discussion volume
- `purchase_intent` — fraction of discussion implying buying behavior
- `confidence` — data quality score
- `is_stub` — True when source has no live credentials

### Step 2: Anti-Hype Filter

Applied to all available signals before weighting.

**Detects fake viral trends** using 4 signals:

```
Base authenticity = 70 (optimistic default)

Penalty: Low engagement ratio (< 1%)     → −25
         (Views without engagement = vanity metric, not real interest)

Penalty: Single-creator dominance (< 20%)→ −30
         (One creator going viral ≠ organic product demand)

Penalty: No search correlation (< 20)   → −20
         (Social virality without search = entertainment, not purchase intent)

Penalty: Absent community discussion      → −10
         (No Reddit/forum discussion = unvalidated by real buyers)

Bonus:   High engagement (> 3%)          → +10
Bonus:   Many creators (> 60)            → +10
Bonus:   Strong search correlation (> 60)→ +10
Bonus:   Community validates trend        → +10

authenticity_score = clamp(base + adjustments, 0, 100)
```

When all sources are stubs: `authenticity_score = 50` (neutral — cannot verify)

### Step 3: Compute Adjusted Trend Velocity

```
raw_velocity = weighted_average(trend_score per live source)

dampen_factor = 0.5 + (authenticity_score / 200)
# Range: 0.50 (fake trend) → 1.00 (verified authentic trend)
# A 90/100 viral signal with 20/100 authenticity → 90 × 0.60 = 54

trend_intelligence_score = raw_velocity × dampen_factor
```

When all sources are stubs: `trend_intelligence_score = 50` (neutral, no penalty)

### Source Weights (when live)

| Source | Weight | Primary Signal | Anti-Hype Contribution |
|---|---|---|---|
| Google Trends | 30% | 12-month interest | search_correlation=100 (search IS the signal) |
| TikTok | 30% | Hashtag volume + velocity | creator_diversity, engagement_ratio |
| Reddit | 20% | Community discussion | community_signal, purchase_intent |
| Pinterest | 10% | Save growth | aspirational_signal |
| Etsy | 10% | Handmade early adoption | early_adoption_signal |

**Etsy signal rationale:** Products selling well on Etsy = real demand + handmade focus.
This implies the market is at "artisan stage" — not yet commoditized. Etsy-trending products
are a leading indicator for future Amazon private-label opportunities.

---

## Amazon Opportunity Gap

**Question answered:** How large is the window between external demand acceleration and current Amazon capture?

**Not a weighted component — generates a bonus and an informational score.**

### Formula

```
external_signal  = (trend_intelligence_score × authenticity_score / 100) / 100
amazon_openness  = market_saturation_score / 100

amazon_gap_score = √(external_signal × amazon_openness) × 100
```

The geometric mean requires BOTH sides to be strong:
- Strong trend + saturated Amazon → low gap (opportunity has passed)
- Weak trend + open Amazon → low gap (nothing is actually pulling demand)
- Strong trend + open Amazon → high gap (the prime entry window)

### Example Gap Scores

| Trend | Auth | Saturation | external_signal | Gap Score |
|---|---|---|---|---|
| 90 | 80 | 75 | 0.72 | √(0.72 × 0.75) = 73.5 |
| 90 | 80 | 25 | 0.72 | √(0.72 × 0.25) = 42.4 |
| 50 | 50 | 65 | 0.25 | √(0.25 × 0.65) = 40.3 |
| 50 | 50 | 80 | 0.25 | √(0.25 × 0.80) = 44.7 |

When all stubs (trend=50, auth=50): gap is driven entirely by market_saturation_score.

### Bonus Activation (+10 pts to final_score)

```
Bonus activates when ALL of:
  trend_intelligence_score > demand_score     (external accelerating faster than Amazon)
  trend_intelligence_score > 55              (meaningful trend, not noise)
  market_saturation_score  > 45             (Amazon not yet fully saturated)

When all sources are stubs: bonus cannot activate
(trend_intelligence_score = 50 = demand_score in most cases)
```

---

## Anti-Hype Failure Modes

The four fake-trend patterns the filter catches:

### Pattern 1: Vanity Virality
```
Signal: 100M views, engagement_ratio = 0.4% (< 1%)
Problem: Views from recommendation algorithm, not organic interest
Penalty: −25
Example: A product demoed on a popular general-interest account
Result:  High view count → low authenticity → dampened trend score
```

### Pattern 2: Single-Creator Dependence
```
Signal: Massive viral moment, creator_diversity = 8 (< 20)
Problem: One influencer × viral = not a product trend
Penalty: −30
Example: One creator posts "my favorite gadget" → goes viral → no follow-up
Result:  Spike without organic spread → near-zero after creator stops
```

### Pattern 3: Searchless Viral
```
Signal: TikTok trend_score = 85, search_correlation = 12 (< 20)
Problem: Entertainment virality has no purchase intent
Penalty: −20
Example: Cute animal using a product → millions of views → zero Google searches
Result:  Social signal without search correlation → purchase intent is absent
```

### Pattern 4: Community-Absent Trend
```
Signal: Strong Google + TikTok, no Reddit discussion
Problem: Real consumer products generate organic community discussion
Penalty: −10
Example: Manufactured brand campaign creating surface-level virality
Result:  Absent community discussion = red flag for artificial promotion
```

---

## Product Narrative Generation

For each product, V4 generates 4 human-readable explanations.
These are constructed deterministically from scoring factors — no AI inference.

### why_growing (why demand is increasing)

**When all stubs:** Constructed from demand component factors.
```
"Amazon signal: {calibrated_sales} units/mo, BSR {trend_direction} with 
{velocity} momentum. External trend sources not yet integrated — 
score reflects Amazon data only."
```

**When live sources:** Constructed from top trend signals.
```
"Google Trends shows {momentum_30d} point increase in 30-day interest.
TikTok content has {creator_diversity} independent creators posting about 
this product with {engagement_ratio}% engagement rate. Reddit discussion 
growing in r/[relevant subreddit]."
```

### why_gap_exists (why Amazon hasn't captured it yet)

Constructed from market_saturation and opportunity_gap analysis.
```
if market_saturation > 65:
  "Amazon competition is low ({saturation}/100). {offer_count} avg sellers 
   per listing, {unique_brand_ratio:.0%} brand fragmentation."
   
if gap_bonus_activated:
  "External trend is outpacing Amazon demand signal — early entry window confirmed."
```

### pl_suitability

| Label | Conditions |
|---|---|
| EXCELLENT | new_seller > 70 AND review_integrity > 70 AND listing_weakness > 55 |
| GOOD | new_seller > 55 AND review_integrity > 55 |
| VIABLE | new_seller > 35 AND review_integrity > 50 |
| DIFFICULT | new_seller ≤ 35 OR review_integrity 40–50 |
| NOT SUITABLE | review_integrity < 40 (manipulation gate) |

### brand_potential

| Label | Conditions |
|---|---|
| FUTURE BRAND | brand_expansion > 75 AND demand > 60 AND trend > 55 |
| BRAND CANDIDATE | brand_expansion > 55 AND demand > 50 |
| SINGLE SKU | brand_expansion 35–55 |
| COMMODITY RISK | brand_expansion < 35 |

---

## Recommendation Logic (V4)

```
STRONG OPPORTUNITY:  final_score ≥ 72
                     AND review_integrity ≥ 60   (manipulation gate)
                     AND demand_score ≥ 55
                     AND trend_intelligence ≥ 45  (not anti-hype rejected)

WORTH RESEARCH:      final_score ≥ 45
                     AND review_integrity ≥ 40

REJECT:              everything else
```

The `trend_intelligence ≥ 45` gate ensures a live source returning a very low score
(e.g., trend dying) can prevent STRONG OPPORTUNITY even if Amazon metrics look good.
When all stubs return 50, this gate always passes — stubs do not penalize.

---

## Output Fields

| Field | Type | V3 | V4 |
|---|---|---|---|
| All V3 fields | — | ✅ | ✅ |
| trend_authenticity_score | float | ❌ | ✅ |
| trend_source_breakdown | List | ❌ | ✅ |
| opportunity_gap_score | float | ❌ | ✅ |
| opportunity_gap_bonus | float | ❌ | ✅ |
| why_growing | str | ❌ | ✅ |
| why_gap_exists | str | ❌ | ✅ |
| pl_suitability_label | str | ❌ | ✅ |
| brand_potential_label | str | ❌ | ✅ |
| top_risks | List[str] | ❌ | ✅ |
| recommended_action | str | ❌ | ✅ |

---

## Stub Behavior Summary

When all 5 trend sources are stubs (V4.0 current state):

| Component | Stub behavior |
|---|---|
| trend_intelligence_score | Returns 50 (neutral — no penalty, no bonus) |
| authenticity_score | Returns 50 (neutral — cannot verify) |
| opportunity_gap_score | Driven by market_saturation only |
| opportunity_gap_bonus | Never activates (requires live source) |
| final_score | Identical to V3 final_score |
| why_growing | Constructed from Amazon data only |
| Recommendation gates | All pass with trend=50 |

**V4 with all stubs produces the same ranking as V3 — by design.**
The new scoring only differentiates when live trend sources are connected.
