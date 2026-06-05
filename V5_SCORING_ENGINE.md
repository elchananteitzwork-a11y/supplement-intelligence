# V5 SCORING ENGINE — SPECIFICATION
**Version:** 5.0.0
**Last Updated:** 2026-06-04

---

## Final Score Formula

```
base_score (0–100) =
    problem_score          × 0.20
  + trend_velocity         × 0.15
  + trend_authenticity     × 0.10
  + amazon_opportunity     × 0.15
  + repeat_purchase        × 0.15
  + brandability           × 0.15
  + review_integrity       × 0.10
  ─────────────────────────────────
  weights sum              = 1.00

Bonuses (each +10, stackable):
  external_acceleration:  trend_velocity > amazon_opportunity AND trend_velocity > 55
  subscription_model:     repeat_purchase ≥ 65 AND category.subscription_eligible
  multi_sku_potential:    brandability ≥ 65 AND expansion_potential ≥ 65

final_score = min(100, base_score + bonuses)
```

Maximum possible bonus: +30. Hard cap: 100.

---

## Layer 1 — Problem Discovery Score (20%)

**Central question:** Are consumers actively articulating a problem that this product solves?

The brands this engine targets were discovered by listening to consumer pain, not Amazon rankings.

### Sources
| Source | Signal | Status |
|---|---|---|
| Reddit | "I wish", "I hate", "I need a better" | Stub |
| Quora | Problem-seeking questions | Stub |
| TikTok Comments | "Where can I find", "does anyone know" | Stub |
| Amazon 1-3★ Reviews | Solution scarcity proxy | Live (via Keepa rating) |

### Sub-factors (total = 100)

**Complaint Frequency (0–30)**
How often does this problem appear in discussions?
- Live: normalized mention count across sources → 0–30
- Stub proxy: avg_rating < 3.8 → 25–28 | < 4.0 → 18–22 | < 4.2 → 12–16 | ≥ 4.4 → 5–8

**Growth Rate (0–20)**
Is discussion of this problem growing?
- Live: 30-day mention growth rate
- Stub: neutral 10 (cannot measure without live sources)

**Emotional Intensity (0–20)**
How strongly do people feel the pain? "Hate" vs "mildly inconvenient"
- Live: sentiment extremity score from NLP analysis
- Stub: category heuristic — wellness/gut/sleep (18–20), beauty/pet (14–16), kitchen (8–10)

**Purchase Intent (0–20)**
Does problem discussion include buying language? "I need to buy", "recommend a product"
- Live: % of problem discussions containing purchase-intent phrases
- Stub: repeat_purchase_potential as proxy: rpp ≥ 70 → 16 | rpp ≥ 50 → 12 | rpp < 30 → 6

**Solution Scarcity (0–10)**
Are existing solutions poorly rated or absent?
- Live: avg competitor rating from Reddit + Quora + Amazon
- Stub: avg_rating < 3.8 → 10 | < 4.0 → 8 | < 4.2 → 5 | ≥ 4.2 → 3

**Stub confidence:** 35% (significant uncertainty — full signal requires live sources)
**Full confidence when live:** 75%+

---

## Layer 2 — Trend Velocity Score (15%)

Identical to V4's Trend Intelligence Engine.
5 sources: Google Trends (30%), TikTok (30%), Reddit (20%), Pinterest (10%), Etsy (10%).
Anti-hype dampening applied before this score is finalized.
Stub behavior: returns 50 (neutral, no penalty).

See V4_SCORING_ENGINE.md §Component 8 for full specification.

---

## Layer 3 — Trend Authenticity Score (10%)

**Now a standalone 10% weighted component** (was only a modifier in V4).

Same four-signal formula:

| Penalty | Condition | Points |
|---|---|---|
| Vanity engagement | ratio < 1% | −25 |
| Single creator | diversity < 20 | −30 |
| No search correlation | correlation < 20 | −20 |
| Absent community | signal < 30 | −10 |

Base score = 70. Bonuses for high engagement/diversity/correlation/community (+10 each).
Stub: returns 50 (neutral).

The higher weight (10% vs. implicit in V4) reflects V5's brand philosophy: authenticity of demand signal is more important than raw viral numbers.

---

## Layer 4 — Amazon Opportunity Score (15%)

Consolidates three separate V3/V4 scores into one entry-window metric.

```
amazon_opportunity =
  demand_quality       × 0.35   (from V3 demand.score)
+ market_accessibility × 0.35   (from V3 new_seller.score)
+ competition_openness × 0.30   (from V3 market_saturation.score)
```

This means V5's 15% Amazon Opportunity captures what was previously 55% of V4's
weighted formula (demand 25% + new_seller 20% + market_saturation 10% = 55%).
The consolidation reflects V5's philosophy: Amazon is validation, not origin.

---

## Layer 5 — Review Integrity Score (10%)

Identical to V3/V4 wipe detection. Weight doubled from V4's 5% to 10%.

Gate logic unchanged:
```
score < 40  → REJECT (overrides all other scores)
score < 60  → cannot reach ICONIC BRAND POTENTIAL or STRONG OPPORTUNITY
```

The higher weight reflects the brand context: a brand's foundation is its social proof.
Manipulated reviews don't just misrepresent a product — they corrupt the brand's
most important long-term asset.

See V3_SCORING_ENGINE.md §Component 7 for full wipe detection specification.

---

## Layer 6 — Repeat Purchase Score (15%) — NEW

**The most structurally important new signal in V5.**

| Brand | Monthly Revenue | Revenue Source |
|---|---|---|
| AG1 | ~$100M/year | Subscription (~80% of revenue) |
| Bloom | ~$60M/year | Subscription + Amazon reorder |
| Liquid I.V. | ~$150M/year | Repeat purchase (2–3×/month) |
| Stanley | ~$750M/year | Not consumable — brand loyalty |

The first three dominate because of repeat purchase. Stanley is the exception.
V5 rewards the repeat-purchase model explicitly because it changes unit economics:
LTV/CAC ratio can exceed 10:1 for strong consumable brands.

### Sub-factors (total = 100)

**Category Baseline (0–50)**
```
pts = CategoryConfig.repeat_purchase_potential × 0.50

Supplements:   rpp=95  → 47.5 pts
Beauty:        rpp=75  → 37.5 pts
Pet:           rpp=55  → 27.5 pts
Kitchen:       rpp=20  → 10.0 pts
```

**Product Type Signal (0–30)**
Keyword detection from product title.

| Tier | Keywords | Points |
|---|---|---|
| Very High | collagen, probiotic, protein, vitamin, supplement, capsule, powder, serum, moisturizer, cream, oil, gel, treat, chew | 28–30 |
| High | beauty, wellness, health, shampoo, conditioner, lotion, spray, refill | 20–24 |
| Medium | brush, pad, filter, replacement | 12–16 |
| Low | board, press, rack, holder, tray, caddy, mat, mold | 4–8 |

**Subscription Viability (0–20)**
```
subscription_eligible = True   → 18 pts
rpp ≥ 60 (consumable but not flagged eligible) → 12 pts
rpp < 30 (one-time purchase)    →  4 pts
```

**Subscription Bonus trigger:** repeat_purchase_score ≥ 65 AND subscription_eligible → +10 to final

---

## Layer 7 — Brandability Score (15%) — REDESIGNED

V4 measured product line expansion. V5 measures identity architecture.

> Can this become a brand that people use to describe who they are?
> "I'm an AG1 person." "I'm a Stanley person." "I'm on Bloom."

This is fundamentally different from "can I add a SKU."

### Sub-factors (total = 100)

**Lifestyle Identity (0–35)**

Tier system derived from product category + title keywords:

| Tier | Category/Keywords | Points |
|---|---|---|
| Movement | gut, sleep, recovery, immunity, stress, energy, focus, hydration, adaptogen, detox, women's health, men's health | 32–35 |
| Identity | beauty, skin, hair, anti-aging, glow, pet health, wellness | 24–28 |
| Enthusiast | fitness, nutrition, outdoor, sport, home cook | 16–20 |
| Functional | kitchen, cooking, baking, organizing | 8–12 |
| Commodity | cutting, board, press, rack, caddy | 3–6 |

**Content Creation Potential (0–25)**

Can a creator make a compelling 60-second video? Can there be a "before/after"?

- Transformation categories (supplements, beauty, wellness): 20–25
- Demonstrable function (kitchen gadgets that have a wow moment): 14–18
- Hidden/abstract benefit (organizational tools): 8–12
- Pure commodity: 4–7

Signal: `repeat_purchase_potential` as proxy (consumables = transformation story possible).

**Community Building (0–20)**

Would users form a community around this lifestyle/product?

- Movement tier → subreddit, Facebook group, Discord: 17–20
- Identity tier → community possible: 13–16
- Enthusiast tier → niche community: 9–12
- Functional/Commodity → low community potential: 3–7

**Subscription Viability (0–20)**

- subscription_eligible = True: 18 pts
- rpp ≥ 60 (could be subscription-like): 12 pts
- rpp < 30: 4 pts

**Multi-SKU Bonus trigger:** brandability_score ≥ 65 AND expansion_potential ≥ 65 → +10 to final

---

## Layer 8 — Amazon Gap (Bonus Generator)

```
amazon_gap_score (0–100) = √(external_signal × amazon_openness) × 100
  external_signal  = (trend_velocity × authenticity / 100) / 100
  amazon_openness  = amazon_opportunity / 100

external_acceleration_bonus (+10):
  Activates: trend_velocity > amazon_opportunity
             AND trend_velocity > 55
             AND NOT all_stubs
```

---

## Recommendation Tiers

| Tier | Conditions |
|---|---|
| ICONIC BRAND POTENTIAL | final ≥ 78 AND review_integrity ≥ 60 AND problem ≥ 55 AND brandability ≥ 65 |
| STRONG OPPORTUNITY | final ≥ 70 AND review_integrity ≥ 60 AND problem ≥ 45 |
| WORTH RESEARCH | final ≥ 45 AND review_integrity ≥ 40 |
| REJECT | all else |

---

## Estimated Output Fields

**Time To Saturation** — estimated from trend velocity + Amazon opportunity:

| Condition | Estimate |
|---|---|
| trend ≥ 70 AND amazon_opp ≤ 40 | 3–6 months (strong trend, Amazon filling fast) |
| trend ≥ 55 AND amazon_opp ≤ 55 | 6–12 months |
| trend ≥ 40 AND amazon_opp ≥ 50 | 12–24 months |
| trend < 40 OR amazon_opp ≥ 70 | 24+ months (early stage) |
| all stubs | Unknown — connect trend sources |

**Copy Difficulty** — derived from brandability + repeat_purchase + price:

| Condition | Label |
|---|---|
| brandability ≥ 75 AND rpp ≥ 70 | Very High (brand identity + consumable moat) |
| brandability ≥ 60 | High (brand identity creates switching costs) |
| rpp ≥ 65 | Medium-High (repeat purchase = customer lock-in) |
| price ≥ $25 | Medium |
| else | Low (commodity, easily replicated) |

---

## Stub Behavior Summary

All sources stubbed (V5.0 default):

| Component | Stub behavior |
|---|---|
| problem_score | 35–65 range (Amazon rating proxy, confidence 35%) |
| trend_velocity | 50 neutral |
| trend_authenticity | 50 neutral |
| amazon_opportunity | Real (Keepa data — full confidence) |
| review_integrity | Real (wipe detection — full confidence) |
| repeat_purchase | Real (category config + keywords — ~75% confidence) |
| brandability | Real (category config + keywords — ~65% confidence) |
| external_bonus | Never activates (needs live trend source) |
| subscription_bonus | Real (activates if category eligible + rpp ≥ 65) |
| multi_sku_bonus | Real (activates if brandability + expansion thresholds met) |

**V5 with stubs produces meaningfully different rankings than V4** because:
1. Problem Score (20%) uses Amazon rating as solution-scarcity proxy
2. Repeat Purchase Score (15%) is fully computable from category config + keywords
3. Brandability (15%) is redesigned and computable
4. Subscription and Multi-SKU bonuses can activate independently of trend stubs
