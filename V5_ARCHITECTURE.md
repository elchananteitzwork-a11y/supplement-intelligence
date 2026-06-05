# V5 PRODUCT DISCOVERY ENGINE — ARCHITECTURE
**Version:** 5.0.0
**Status:** Implemented
**Last Updated:** 2026-06-04

---

## The Mission

> Do not find products. Find the next Liquid I.V., AG1, Stanley, Bloom, Oura Ring.

Every previous version started with Amazon. V5 starts with **consumer behavior**.

```
Consumer Demand
  → Problem Detection          [Layer 1 — NEW]
  → Trend Validation           [Layer 2]
  → Trend Authenticity         [Layer 3]
  → Amazon Validation          [Layer 4]
  → Review Integrity           [Layer 5]
  → Repeat Purchase Analysis   [Layer 6 — NEW]
  → Brandability Assessment    [Layer 7 — REDESIGNED]
  → Amazon Gap Score           [Layer 8]
```

---

## The Fundamental Insight

| V2–V4 Question | V5 Question |
|---|---|
| "What's already selling well on Amazon?" | "What problem are consumers actively trying to solve?" |
| "Is BSR trending up?" | "Is the conversation growing faster outside Amazon than inside?" |
| "Can I win the listing?" | "Can I build a brand people have an identity relationship with?" |

The brands V5 is designed to discover — AG1, Bloom, Seed, Beam, Liquid I.V. — were not found by scanning Amazon bestseller lists. They were identified by detecting:
1. A real problem with weak existing solutions
2. A growing cultural conversation (pre-Amazon)
3. A category where lifestyle identity creates lock-in
4. A repeat purchase pattern that builds compounding revenue
5. A brand archetype with loyal communities

V5 scores all 8 of these dimensions.

---

## Scoring Architecture

```
Layer    Component              Weight   Gate
──────────────────────────────────────────────
  1      Problem Discovery       20%      —
  2      Trend Velocity          15%      —
  3      Trend Authenticity      10%      —
  4      Amazon Opportunity      15%      —
  5      Review Integrity        10%    < 40 → REJECT
  6      Repeat Purchase         15%      —
  7      Brandability            15%      —
──────────────────────────────────────────────
         Base Score             100%

Bonus:   External Acceleration  +10    trend > amazon AND trend > 55
         Subscription Model     +10    rpp ≥ 65 AND subscription_eligible
         Multi-SKU Potential    +10    brandability ≥ 65 AND expansion ≥ 65

         Max bonus              +30    (capped at 100 total)
```

---

## Layer-by-Layer Design

### Layer 1 — Problem Discovery (20%)

**The insight no Amazon scanner captures:**
Every successful brand solves a specific, emotionally resonant problem.
AG1 → "I can't maintain consistent nutrition." Bloom → "My gut health is destroying my energy."
Oura → "I don't understand why I feel tired."

Problem Discovery scans where consumers articulate these problems:
- Reddit: "I hate that..." / "I wish there was..." / "I'm struggling with..."
- Quora: problem-seeking questions
- TikTok comments: "where can I find..." / "I need this"
- Amazon 1-3★ reviews: complaints about existing solutions (available via Keepa)

**When all sources are stubs:** Amazon avg_rating < 4.0 serves as a solution-scarcity proxy. Category heuristics provide baseline problem awareness.

### Layer 2 — Trend Velocity (15%)

Inherits from V4's trend intelligence engine with the same 5-source architecture.
Same source weights: Google Trends (30%), TikTok (30%), Reddit (20%), Pinterest (10%), Etsy (10%).

### Layer 3 — Trend Authenticity (10%)

**Now a standalone scored component** (was a modifier in V4).
Same anti-hype math: base 70, penalties for vanity engagement/single creator/absent search/no community.
Weight in final formula: 10% (double V4's implicit influence).

### Layer 4 — Amazon Opportunity (15%)

Consolidates V3's three separate components (Demand + New Seller + Market Saturation) into a single Amazon entry-window score.

```
Amazon Opportunity =
  Demand Quality        × 0.35   (BSR trend, calibrated sales)
+ Market Accessibility  × 0.35   (new sellers winning, review barrier)
+ Competition Openness  × 0.30   (saturation, Amazon presence, price spread)
```

### Layer 5 — Review Integrity (10%)

Identical to V3/V4 detection logic. Weight doubled (5% → 10%) — manipulation is a deal-breaker in V5's brand-building context. Brands built on manipulated reviews collapse at scale.

### Layer 6 — Repeat Purchase (15%) — NEW

**The single most underrated signal in Amazon research.**
The brands V5 targets (AG1, Seed, Bloom, Liquid I.V.) are not unicorns because of their first purchase. They're unicorns because of their 12th, 24th, 48th purchase.

Repeat purchase fundamentally changes unit economics:
- High repeat: acquire customer once, earn monthly for years (LTV >> CAC)
- Low repeat: acquire customer once, margin squeezed by PPC forever

Sources: CategoryConfig.repeat_purchase_potential + product keyword analysis + subscription viability.

### Layer 7 — Brandability (15%) — REDESIGNED

V4's Brand Expansion measured product line expansion (can I add more SKUs?).
V5's Brandability measures **identity architecture** (can people become a version of themselves through this brand?).

| Dimension | Max | What it measures |
|---|---|---|
| Lifestyle Identity | 35 | Is this tied to an identity movement? (gut health, sleep, recovery) |
| Content Creation | 25 | Can 60-second compelling content be made? Before/after potential? |
| Community Building | 20 | Would people join communities around this product/lifestyle? |
| Subscription Viability | 20 | Can this be sold as a monthly subscription? |

The brands V5 targets all score high on all four:
- AG1: gut health identity + transformation content + /r/nutrition community + subscription
- Stanley: hydration identity + desk-tour content + #WaterTok + no subscription needed (but high repeat)
- Bloom: women's wellness identity + TikTok transformation + community + subscription

### Layer 8 — Amazon Gap (Bonus Generator)

```
external_acceleration_bonus (+10):
  Activates: trend_velocity > amazon_opportunity AND trend_velocity > 55
  Meaning: external demand is outpacing Amazon's capture rate

subscription_bonus (+10):
  Activates: repeat_purchase_score ≥ 65 AND category.subscription_eligible = True
  Meaning: recurring revenue model validated

multi_sku_bonus (+10):
  Activates: brandability_score ≥ 65 AND category.expansion_potential ≥ 65
  Meaning: single product is a launchpad, not a ceiling
```

---

## Repository Layout (V5 additions)

```
v5/
├── __init__.py
├── models.py                      # V5OpportunityScore, V5Narrative, BonusBreakdown
├── engine.py                      # V5 orchestrator
├── output.py                      # CSV, JSON, console reporters
│
├── components/
│   ├── __init__.py                # V5 MarketContext (superset of V4)
│   ├── problem_discovery.py       # Layer 1 — Problem Score (20%)
│   ├── trend_velocity.py          # Layer 2 — thin wrapper on V4 trend_intelligence
│   ├── trend_authenticity.py      # Layer 3 — standalone (10%)
│   ├── amazon_opportunity.py      # Layer 4 — consolidates V3 demand+new_seller+saturation
│   ├── review_integrity.py        # Layer 5 — wrapper on V3 (weight 10%)
│   ├── repeat_purchase.py         # Layer 6 — NEW (15%)
│   ├── brandability.py            # Layer 7 — redesigned (15%)
│   └── amazon_gap.py              # Layer 8 — bonus generator
│
└── sources/
    ├── __init__.py                # ProblemSignal dataclass + ProblemDataSource protocol
    │                              # (reuses V4 TrendDataSourceV4 for trend layers)
    ├── reddit_problem_stub.py     # Reddit problem signal stub
    ├── quora_stub.py              # Quora question pattern stub
    └── tiktok_comments_stub.py   # TikTok comments stub

run_v5.py
```

### Inheritance Map

```
V3 code used:
  v3/components/review_integrity.py → v5/components/review_integrity.py (weight change only)
  v3/components/demand.py           → called inside v5/components/amazon_opportunity.py
  v3/components/new_seller.py       → called inside v5/components/amazon_opportunity.py
  v3/components/market_saturation.py → called inside v5/components/amazon_opportunity.py

V4 code used:
  v4/components/trend_intelligence.py → called inside v5/components/trend_velocity.py
  v4/components/anti_hype.py         → called inside v5/components/trend_authenticity.py
  v4/sources/                         → all 5 trend stubs reused for Layer 2
  
New in V5:
  v5/sources/__init__.py             ProblemSignal protocol (entirely new)
  v5/sources/*_stub.py               3 problem discovery stubs (new)
  v5/components/problem_discovery.py entirely new
  v5/components/repeat_purchase.py   entirely new
  v5/components/brandability.py      redesigned (V4 brand_expansion ≠ V5 brandability)
```

---

## Recommendation Tiers

```
ICONIC BRAND POTENTIAL   final ≥ 78  AND  review_integrity ≥ 60
                         AND  problem ≥ 55  AND  brandability ≥ 65

STRONG OPPORTUNITY       final ≥ 70  AND  review_integrity ≥ 60  AND  problem ≥ 45

WORTH RESEARCH           final ≥ 45  AND  review_integrity ≥ 40

REJECT                   everything else (manipulation gate or too low)
```

---

## New Output Fields (vs V4)

| Field | V4 | V5 |
|---|---|---|
| problem_score | ❌ | ✅ 20% of final |
| trend_authenticity_score | modifier only | ✅ 10% standalone component |
| repeat_purchase_score | ❌ | ✅ 15% of final |
| brandability_score | brand_expansion (V4 different) | ✅ redesigned 15% |
| time_to_saturation | ❌ | ✅ categorical estimate |
| copy_difficulty | ❌ | ✅ Low / Medium / High / Very High |
| subscription_bonus | ❌ | ✅ 0 or +10 |
| multi_sku_bonus | ❌ | ✅ 0 or +10 |
| external_bonus | ✅ same | ✅ same |
| why_people_want_it | ❌ | ✅ from problem_discovery |
| brand_assessment | partial | ✅ full 4-dimension analysis |
