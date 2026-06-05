# V4 PRODUCT DISCOVERY ENGINE — ARCHITECTURE
**Version:** 4.0.0
**Status:** Implemented
**Last Updated:** 2026-06-04

---

## The Philosophical Shift

V2 and V3 started from Amazon data and asked: *"Is this already selling well?"*

V4 starts from external signals and asks: *"Is demand building across the internet BEFORE Amazon becomes saturated?"*

The goal is not to find products. The goal is to find **future brands**.

```
V3 mental model:   Amazon bestseller list → filter → score → rank
V4 mental model:   Cultural signal → trend validation → Amazon gap check → entry window
```

This inversion changes what ranks #1. A product that sells 2,000 units/month on Amazon
but is surrounded by strong competitors ranks lower than a product selling 400 units/month
on Amazon where TikTok, Reddit, and Google Trends all show accelerating external demand
that hasn't yet been captured by Amazon sellers.

---

## Two Discovery Modes

### Mode 1: Amazon-First (Current — all trend sources stubbed)
Same fetch pipeline as V3. External trend stubs return neutral (50).
The opportunity_gap bonus requires live sources to activate.
Results are directionally valid but conservative — real opportunities may be invisible
until trend sources are connected.

### Mode 2: Trend-First (Future — requires live trend sources)
1. Pull trending keywords from Google Trends / TikTok / Reddit
2. Extract product intent signals
3. Cross-reference against Keepa category ASINs
4. Score: high external trend + weak Amazon competition = prime window

Both modes use the same scoring engine. Mode switching happens in discovery only.

---

## What V4 Inherits from V3 (Unchanged)

All 6 Amazon-validation components are imported directly:

```
v3/components/demand.py           → Demand Score (25%)
v3/components/new_seller.py       → New Seller Success Score (20%)
v3/components/listing_weakness.py → Listing Weakness Score (15%)
v3/components/market_saturation.py → Market Saturation Score (10%)
v3/components/brand_expansion.py  → Brand Expansion Score (10%)
v3/components/review_integrity.py → Review Integrity Score (5%)
```

The review_integrity REJECT gate (`score < 40 → REJECT`) is preserved.
The new_seller per-product bonus is preserved.
All Keepa infrastructure (client, normalizer, bsr, prices, fba) is unchanged.

---

## What V4 Adds

### 1. Extended Source Protocol

V3's `TrendDataSource` returned a single `Optional[float]`.
V4's `TrendDataSourceV4` returns a `TrendSignal` dataclass with:

- `trend_score` — 0–100 overall score
- `momentum_30d` — short-term acceleration
- `momentum_90d` — medium-term trend
- `stability_12m` — long-term staying power
- `engagement_ratio` — quality signal (anti-hype)
- `creator_diversity` — single-creator vs. organic spread (anti-hype)
- `search_correlation` — is social virality backed by search intent? (anti-hype)
- `community_signal` — organic discussion volume (anti-hype)
- `purchase_intent` — does discussion imply buying behavior?

Five sources (all stubs, ready for live implementation):
| Source | Weight | Signal |
|---|---|---|
| Google Trends | 30% | Search growth (authoritative purchase intent) |
| TikTok | 30% | Viral product content + creator spread |
| Reddit | 20% | Organic community discussion + problem signals |
| Pinterest | 10% | Aspirational consumer trend (pre-purchase) |
| Etsy | 10% | Handmade early adoption (pre-commoditization signal) |

### 2. Anti-Hype Filter

Detects fake viral trends before they pollute the trend velocity score.

```
Base score = 70 (assume authentic by default)

Penalties:
  Low engagement ratio (< 1% views)     → −25 (vanity metric)
  Single creator dominance (< 20%)      → −30 (manufactured viral)
  No search correlation (< 20)          → −20 (viral without purchase intent)
  Missing community discussion           → −10 (unvalidated by real users)

Bonuses:
  High engagement (> 3%)                → +10
  Many creators (diversity > 60)        → +10
  Strong search correlation (> 60)      → +10
  Community validates trend              → +10

Result: trend_authenticity_score (0–100)
```

The authenticity score DAMPENS the trend velocity score:
```
adjusted_velocity = raw_velocity × (0.5 + authenticity/200)
```
Range of dampen factor: 0.5 (fake trend) to 1.0 (verified trend).
A 90/100 viral signal with 20/100 authenticity becomes: 90 × 0.6 = 54 (near neutral).

### 3. Opportunity Gap Score + Bonus

The core V4 innovation: quantifies the gap between external trend and Amazon capture.

```
amazon_gap_score = √(external_signal × amazon_openness) × 100

where:
  external_signal  = (trend_velocity × authenticity / 100) / 100
  amazon_openness  = market_saturation_score / 100

Bonus (+10 pts to final score) activates when:
  trend_velocity > demand_score     (external growing faster than Amazon)
  trend_velocity > 55               (meaningful signal, not noise)
  market_saturation > 45            (Amazon not yet fully saturated)
```

The geometric mean formula ensures BOTH conditions must be strong for a high gap score.
A strong trend with a saturated Amazon market → low gap (opportunity has passed).
A weak trend with an open Amazon market → low gap (nothing is actually pulling demand).

### 4. Narrative Intelligence

Every product gets a `ProductNarrative` with 4 human-readable explanations:
- **why_growing**: constructed from demand trend + top trend signal
- **why_gap_exists**: constructed from market saturation + opportunity gap analysis
- **pl_suitability**: EXCELLENT / GOOD / VIABLE / DIFFICULT / NOT SUITABLE
- **brand_potential**: FUTURE BRAND / BRAND CANDIDATE / SINGLE SKU / COMMODITY RISK

These are derived from scoring factor rationales — no AI inference required.
Fully deterministic and auditable.

---

## Repository Layout (V4 additions)

```
v4/
├── __init__.py
├── models.py                    # V4OpportunityScore, TrendBreakdown, ProductNarrative
├── engine.py                    # V4 orchestrator
├── output.py                    # CSV + JSON report writers
│
├── components/
│   ├── __init__.py              # V4 MarketContext (superset of V3)
│   ├── trend_intelligence.py    # Trend Intelligence Engine (replaces V3 trend_velocity)
│   ├── anti_hype.py             # Anti-Hype Filter (helper module)
│   └── opportunity_gap.py       # Amazon Opportunity Gap + bonus logic
│
└── sources/
    ├── __init__.py              # TrendSignal dataclass + TrendDataSourceV4 protocol
    ├── google_trends_stub.py    # Extended: momentum_30d, momentum_90d, stability_12m
    ├── tiktok_stub.py           # Extended: creator_diversity, engagement_ratio
    ├── reddit_stub.py           # Extended: community_signal, purchase_intent
    ├── pinterest_stub.py        # Extended: save_growth, aspirational_signal
    └── etsy_stub.py             # New: handmade adoption, pre-commoditization signal

run_v4.py                        # CLI entry point
V4_ARCHITECTURE.md               # This document
V4_SCORING_ENGINE.md             # Scoring specification
```

---

## Data Flow

```
run_v4.py
    │
    ├─[1] FETCH (same as V3)
    │   discovery_agent → Keepa ASINs → normalize → initial filter
    │
    ├─[2] ANALYZE (same as V3)
    │   keepa.bsr + keepa.reviews + keepa.prices
    │
    └─[3] SCORE (V4 engine)
         │
         ├─ _build_market_context()
         │    extends V3 MarketContext with trend_signals_available flag
         │
         └─ for each product:
              │
              ├─ V3 components (unchanged):
              │   demand → new_seller → listing_weakness →
              │   market_saturation → brand_expansion → review_integrity
              │
              ├─ V4 new components:
              │   anti_hype.compute_authenticity(trend_signals)
              │   trend_intelligence.score(product, bsr, ctx, sources)
              │   opportunity_gap.compute(trend_vel, market_sat, authenticity)
              │
              ├─ final_score = weighted_sum + gap_bonus (capped 100)
              │
              └─ narrative = _generate_narrative(all component scores)
                  → why_growing
                  → why_gap_exists
                  → pl_suitability
                  → brand_potential
```

---

## Activating a Live Source

The V4 source protocol (`TrendDataSourceV4`) requires implementing `get_signal()`:

```python
class MyGoogleTrends:
    name = "google_trends"
    weight = 0.30
    is_available = True

    def get_signal(self, keyword: str, category: str = "") -> Optional[TrendSignal]:
        # Call pytrends / SerpAPI / etc.
        raw = fetch_google_trends(keyword)
        return TrendSignal(
            source_name="google_trends",
            keyword=keyword,
            trend_score=normalize_to_100(raw.interest_over_time),
            momentum_30d=raw.last_30d_delta,
            momentum_90d=raw.last_90d_delta,
            stability_12m=raw.stability_score,
            engagement_ratio=None,    # N/A for search data
            creator_diversity=None,   # N/A for search data
            search_correlation=100.0, # search IS the signal
            community_signal=None,
            purchase_intent=raw.shopping_queries_pct,
            confidence=80.0,
            is_stub=False,
        )
```

Pass to engine: `v4.engine.run(..., trend_sources=[MyGoogleTrends(), TikTokStub(), ...])`
No other files change. The anti-hype filter and opportunity gap automatically use the new data.

---

## V4 vs V3 — Component Comparison

| Component | V3 | V4 |
|---|---|---|
| Demand Score | ✅ unchanged | ✅ inherited from V3 |
| New Seller Success | ✅ unchanged | ✅ inherited from V3 |
| Listing Weakness | ✅ unchanged | ✅ inherited from V3 |
| Market Saturation | ✅ unchanged | ✅ inherited from V3 |
| Brand Expansion | ✅ unchanged | ✅ inherited from V3 |
| Review Integrity | ✅ unchanged (gate) | ✅ inherited from V3 |
| Trend Velocity | Stubs, neutral 50 | Stubs + **anti-hype dampening** |
| Anti-Hype Filter | ❌ not present | ✅ **new** |
| Opportunity Gap | ❌ not present | ✅ **new + bonus** |
| Narrative | ❌ not present | ✅ **new — 4-field explanation** |
| Etsy source | ❌ not present | ✅ stub ready |
