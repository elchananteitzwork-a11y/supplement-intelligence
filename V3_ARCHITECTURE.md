# V3 PRODUCT DISCOVERY ENGINE — ARCHITECTURE
**Version:** 3.0.0
**Status:** Implemented
**Last Updated:** 2026-06-04

---

## Design Goals

V2 scored products using 12 demand/margin/competition factors — all derived from Keepa.
It had no manipulation detection, no new-seller success signal, and no external trend data.

V3 is redesigned around a single question:

> **Can a new seller enter this market today and build a profitable brand?**

V2 → V3 key changes:

| Area | V2 | V3 |
|------|----|----|
| Score components | 12 factors (demand/margin blend) | 7 purpose-built components |
| Manipulation detection | None | Review Integrity Score (gating signal) |
| New seller proof | Market-level accessibility only | Per-scan winner count + R2R efficiency |
| Trend data | None | Pluggable source protocol (4 stubs ready) |
| Brand potential | Not scored | Brand Expansion Score |
| Listing opportunity | Not scored | Listing Weakness Score |
| Data source architecture | Keepa only (hardcoded) | Source adapter protocol |

---

## Repository Layout (V3 additions)

```
v3/
├── __init__.py               # package version
├── models.py                 # V3 dataclasses (OpportunityScore, ComponentScore, etc.)
├── engine.py                 # orchestrator — builds context, scores all products
├── output.py                 # CSV + JSON report writers
│
├── components/
│   ├── __init__.py           # MarketContext dataclass + shared helpers
│   ├── demand.py             # Component 1 — Demand Score (25%)
│   ├── new_seller.py         # Component 2 — New Seller Success Score (20%)
│   ├── listing_weakness.py   # Component 3 — Listing Weakness Score (15%)
│   ├── trend_velocity.py     # Component 4 — Trend Velocity Score (15%)
│   ├── market_saturation.py  # Component 5 — Market Saturation Score (10%)
│   ├── brand_expansion.py    # Component 6 — Brand Expansion Score (10%)
│   └── review_integrity.py   # Component 7 — Review Integrity Score (5%)
│
└── sources/
    ├── __init__.py           # TrendDataSource protocol (structural subtyping)
    ├── tiktok_stub.py        # TikTok Research API stub
    ├── google_trends_stub.py # Google Trends / pytrends stub
    ├── reddit_stub.py        # Reddit API stub
    └── pinterest_stub.py     # Pinterest API stub

run_v3.py                     # CLI entry point (replaces run_discovery.py for V3)
```

### What V3 inherits unchanged from V2

```
keepa/
  client.py       → Keepa API calls
  normalizer.py   → raw product → normalized dict (4-level price cascade)
  bsr.py          → BSR trend analysis → BSRAnalysis
  reviews.py      → review velocity + tier analysis → ReviewVelocityAnalysis
  prices.py       → price history analysis → PriceAnalysis
  fba.py          → FBA fee estimation
  sales_estimate.py → BSR→sales calibration

categories/       → per-category config (BSR range, excluded brands, expansion_potential)
```

---

## Data Flow

```
run_v3.py
    │
    ├─[1] FETCH ─────────────────────────────────────────────────────
    │   discovery_agent.run(category_config, ...)
    │   → raw ASINs from Keepa bestseller lists
    │   → normalize_product() for each ASIN
    │   → initial criteria filter (BSR range, price floor, review cap)
    │
    ├─[2] ANALYZE ───────────────────────────────────────────────────
    │   keepa.bsr.run()       → List[BSRAnalysis]
    │   apply_post_analysis_filter()   (min_monthly_sales, declining filter)
    │   keepa.reviews.run()   → ReviewVelocityAnalysis
    │   keepa.prices.run()    → PriceAnalysis
    │
    └─[3] SCORE (V3 engine) ─────────────────────────────────────────
        v3.engine.run()
            │
            ├─ _build_market_context()    ← pre-compute scan-level aggregates
            │    (one pass over all products, bsr_results, price_result)
            │
            └─ for each product:
                 ├─ demand.score()           Keepa BSR + price data
                 ├─ new_seller.score()       Keepa review tiers + market_ctx
                 ├─ listing_weakness.score() Keepa ratings + brand signals
                 ├─ trend_velocity.score()   TrendDataSource adapters (stubs)
                 ├─ market_saturation.score() Keepa offer_count + market_ctx
                 ├─ brand_expansion.score()  market_ctx + CategoryConfig
                 └─ review_integrity.score() Keepa review_count history deltas
                 │
                 └─ final_score = weighted sum
                    recommendation = STRONG OPPORTUNITY / WORTH RESEARCH / REJECT
```

---

## Component Boundary Contract

Every component module exports a single `score()` function:

```python
def score(
    product: Dict[str, Any],      # normalized Keepa product dict
    bsr:     BSRAnalysis,          # pre-computed BSR analysis for this ASIN
    ctx:     MarketContext,        # scan-level pre-computed aggregates
) -> ComponentScore:
    ...
```

The engine calls each component and never passes raw Keepa API responses.
Components read only from the normalized product dict and pre-computed context.
This makes components independently testable and replaceable.

---

## Source Adapter Protocol (Trend Velocity)

The `TrendDataSource` protocol is defined in `v3/sources/__init__.py`:

```python
class TrendDataSource(Protocol):
    name:         str    # identifier used in output reports
    weight:       float  # default contribution weight (0.0–1.0)
    is_available: bool   # False for stubs

    def get_score(self, keyword: str, category: str = "") -> Optional[float]:
        # Returns 0–100 trend score, or None if unavailable
        ...
```

**Adding a live source:**
1. Create `v3/sources/my_source.py` implementing `TrendDataSource`
2. Pass an instance to `v3.engine.run(trend_sources=[...])`
3. The `trend_velocity` component auto-detects `is_available=True` and includes it

No changes to the engine or any other component are required.

**Default source weights (when all live):**

| Source | Weight | Signal |
|--------|--------|--------|
| Google Trends | 40% | 12-month search interest |
| TikTok | 35% | Hashtag volume + virality |
| Reddit | 15% | Community discussion volume |
| Pinterest | 10% | Aspirational demand (saves) |

When no live sources are available (all stubs), `trend_velocity` returns 50 (neutral).

---

## MarketContext — Pre-Computed Scan Aggregates

`MarketContext` is built once per scan from all products in the filtered pool:

```python
@dataclass
class MarketContext:
    # Saturation signals
    avg_offer_count:     Optional[float]   # mean FBA/FBM seller count
    unique_brand_ratio:  float             # distinct brands / total products
    amazon_bb_pct:       Optional[float]   # % of BB held by Amazon direct
    price_band_usd:      Optional[float]   # max_price − min_price
    price_compressed:    bool              # band < $3

    # New seller success signals
    low_review_winners:      int            # products: reviews < 100 AND BSR avg < 3000
    avg_velocity_low_review: Optional[float]
    best_r2r_efficiency:     Optional[float]
    avg_r2r_efficiency:      Optional[float]

    # Listing weakness signals
    avg_rating:          Optional[float]
    unknown_brand_pct:   float

    # Brand expansion signals
    seasonal_pct:           float
    median_cal_sales:       Optional[int]
    expansion_potential:    int             # from CategoryConfig (default 50)
    category_avg_price:     Optional[float]
```

This design means:
- Market-level scores are computed once (not N times for N products)
- Components that depend on market comparisons always have consistent baselines
- The context is deterministic and cacheable

---

## Recommendation Logic

```
STRONG OPPORTUNITY  ← final_score ≥ 72
                       AND review_integrity_score ≥ 60   (manipulation gate)
                       AND demand_score ≥ 55

WORTH RESEARCH      ← final_score ≥ 45
                       AND review_integrity_score ≥ 40

REJECT              ← otherwise
                       (low score OR review_integrity < 40)
```

`review_integrity_score` acts as a hard gate: a product with strong demand and weak
competition still gets REJECT if manipulation is detected. This directly addresses
the V2 false-positive problem (3/3 Kitchen deep-validation rejects).

---

## Risk and Competition Labels

```
competition_level:
    LOW    → market_saturation_score ≥ 65
    MEDIUM → market_saturation_score 40–64
    HIGH   → market_saturation_score < 40

risk_level:
    HIGH   → review_integrity_score < 50  OR  bsr trend = "Declining"
    MEDIUM → review_integrity_score 50–70 OR  demand_score < 45
    LOW    → review_integrity_score ≥ 70  AND demand stable/improving
```

---

## Extension Points

| Future capability | Where to add |
|---|---|
| New trend source (TikTok, etc.) | New file in `v3/sources/`, implement protocol |
| Listing scraper (images, A+, video) | Expand `listing_weakness.py` stubs |
| Supplier data (MOQ, COGS) | New component `supplier.py` + weight rebalance |
| Review sentiment mining | Extend `listing_weakness.py` rating signal |
| Listing age from first-sale data | Extend `new_seller.py` with creation date |
| Category velocity recalibration | Update `keepa/sales_estimate.py` table |

---

## V3 vs V2 — Component Mapping

| V2 Factor | Weight | V3 Replacement |
|---|---|---|
| demand_level | 13% | demand.py → monthly_sales sub-factor |
| demand_trend | 9% | demand.py → bsr_trend sub-factor |
| revenue_potential | 8% | demand.py → monthly_sales (folded in) |
| competition_accessibility | 10% | new_seller.py → low_review_winners |
| review_barrier | 9% | new_seller.py → per-product adjustment |
| review_velocity_threat | 6% | new_seller.py → velocity sub-factor |
| price_stability | 6% | demand.py → price_stability sub-factor |
| price_compression_risk | 7% | market_saturation.py → price_spread |
| buybox_opportunity | 7% | market_saturation.py → amazon_presence |
| promotional_pressure | 5% | market_saturation.py (folded in) |
| seasonality_risk | 5% | demand.py + brand_expansion.py |
| fba_margin | 15% | demand.py (margin informs sales quality) |
| *(missing)* | — | listing_weakness.py ← NEW |
| *(missing)* | — | trend_velocity.py ← NEW |
| *(missing)* | — | brand_expansion.py ← NEW |
| *(missing)* | — | review_integrity.py ← NEW (V2's critical gap) |
