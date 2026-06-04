"""
Product opportunity scoring engine — Phase 2.

Converts the outputs of all Phase 1 analysis modules into a single
0–100 opportunity score per product.

12 factors, weights sum to 100:

  Factor                    Weight
  ─────────────────────────────────
  Demand Level               15
  Demand Trend               10
  Revenue Potential          10
  Competition Accessibility  10
  Review Barrier             8
  Review Velocity Threat     7
  Price Stability            8
  Price Compression Risk     8
  Buy Box Opportunity        8
  Promotional Pressure       5
  Seasonality Risk           5
  Profit Margin Proxy        6
  ─────────────────────────────────
  TOTAL                     100

Grade bands:
  A  80–100  Excellent Opportunity
  B  65–79   Good Opportunity
  C  50–64   Average Opportunity
  D  35–49   Below Average
  F  0–34    Poor Opportunity
"""

from typing import Any, Dict, List, Optional, Tuple

from keepa.models import BSRAnalysis, FactorScore, PriceAnalysis, ProductScore, ReviewVelocityAnalysis
from keepa.reviews import _review_velocity


# ──────────────────────────────────────────────────────────────────
# Factor weights (must sum to 100)
# ──────────────────────────────────────────────────────────────────

WEIGHTS: Dict[str, int] = {
    "demand_level":              15,
    "demand_trend":              10,
    "revenue_potential":         10,
    "competition_accessibility": 10,
    "review_barrier":             8,
    "review_velocity_threat":     7,
    "price_stability":            8,
    "price_compression_risk":     8,
    "buybox_opportunity":         8,
    "promotional_pressure":       5,
    "seasonality_risk":           5,
    "profit_margin_proxy":        6,
}

assert sum(WEIGHTS.values()) == 100, "Weights must sum to 100"


# ──────────────────────────────────────────────────────────────────
# Individual factor scorers
# Each returns (points_awarded, rationale_string)
# ──────────────────────────────────────────────────────────────────

def _f_demand_level(monthly_sales: Optional[int]) -> Tuple[float, str]:
    if not monthly_sales:
        return 0, "No sales estimate — BSR data missing"
    if monthly_sales >= 1000: return 15, f"{monthly_sales:,} units/mo — high demand"
    if monthly_sales >= 500:  return 12, f"{monthly_sales:,} units/mo — solid demand"
    if monthly_sales >= 200:  return 9,  f"{monthly_sales:,} units/mo — moderate demand"
    if monthly_sales >= 100:  return 5,  f"{monthly_sales:,} units/mo — low demand"
    if monthly_sales >= 50:   return 2,  f"{monthly_sales:,} units/mo — very low demand"
    return 0, f"{monthly_sales:,} units/mo — insufficient demand"


def _f_demand_trend(trend: str, velocity: str) -> Tuple[float, str]:
    table = {
        ("Improving",  "Accelerating"):  (10, "Demand rising and accelerating"),
        ("Improving",  "Stable"):         (8, "Demand improving, steady acceleration"),
        ("Improving",  "Decelerating"):   (6, "Demand improving but slowing"),
        ("Improving",  "Unknown"):        (6, "Demand improving"),
        ("Stable",     "Accelerating"):   (7, "Stable demand, acceleration signal"),
        ("Stable",     "Stable"):         (5, "Stable demand"),
        ("Stable",     "Decelerating"):   (3, "Stable demand but decelerating"),
        ("Stable",     "Unknown"):        (4, "Stable demand"),
        ("Declining",  "Accelerating"):   (2, "Declining demand — brief acceleration signal"),
        ("Declining",  "Stable"):         (1, "Declining demand"),
        ("Declining",  "Decelerating"):   (0, "Declining and decelerating — avoid"),
        ("Declining",  "Unknown"):        (1, "Declining demand"),
    }
    pts, note = table.get((trend, velocity), (3, f"Trend: {trend} / Velocity: {velocity}"))
    return pts, note


def _f_revenue_potential(monthly_sales: Optional[int], price: Optional[float]) -> Tuple[float, str]:
    if not monthly_sales or not price:
        return 0, "Insufficient data for revenue estimate"
    rev = monthly_sales * price
    if rev >= 20_000: return 10, f"${rev:,.0f}/mo — excellent revenue"
    if rev >= 10_000: return 8,  f"${rev:,.0f}/mo — strong revenue"
    if rev >= 5_000:  return 6,  f"${rev:,.0f}/mo — good revenue"
    if rev >= 2_500:  return 4,  f"${rev:,.0f}/mo — moderate revenue"
    if rev >= 1_000:  return 2,  f"${rev:,.0f}/mo — low revenue"
    return 0, f"${rev:,.0f}/mo — insufficient revenue"


def _f_competition_accessibility(verdict: str) -> Tuple[float, str]:
    return {
        "Highly Accessible": (10, "3+ sellers < 100 reviews making real sales"),
        "Accessible":         (7, "Multiple sellers < 500 reviews competing"),
        "Hard to Enter":      (3, "Few sellers below 1,000 reviews"),
        "Locked":             (0, "Market dominated by established sellers"),
    }.get(verdict, (3, f"Accessibility: {verdict}"))


def _f_review_barrier(review_count: Optional[int]) -> Tuple[float, str]:
    """Score based on THIS product's review count — lower = lower barrier to compete."""
    if review_count is None:
        return 4, "No review data"
    if review_count < 50:    return 8, f"{review_count} reviews — very low barrier"
    if review_count < 100:   return 6, f"{review_count} reviews — low barrier"
    if review_count < 250:   return 4, f"{review_count} reviews — moderate barrier"
    if review_count < 500:   return 2, f"{review_count} reviews — high barrier"
    return 0, f"{review_count:,} reviews — very high barrier"


def _f_review_velocity_threat(velocity: Optional[float]) -> Tuple[float, str]:
    """Lower velocity = easier for a new seller to catch up."""
    if velocity is None:
        return 3, "No velocity data"
    if velocity < 5:   return 7, f"{velocity}/mo — slow market, easy to catch up"
    if velocity < 15:  return 5, f"{velocity}/mo — moderate velocity"
    if velocity < 30:  return 3, f"{velocity}/mo — fast velocity, harder to catch"
    return 1, f"{velocity}/mo — very fast — difficult to compete"


def _f_price_stability(trend: str) -> Tuple[float, str]:
    return {
        "Rising":            (8, "Prices rising — market has pricing power"),
        "Stable":            (6, "Prices stable — predictable margins"),
        "Declining":         (1, "Prices declining — margin erosion risk"),
        "Insufficient data": (3, "Insufficient price history"),
    }.get(trend, (3, f"Price trend: {trend}"))


def _f_price_compression(compressed: bool, band: Optional[float]) -> Tuple[float, str]:
    if band is None:
        return 4, "No price band data"
    if compressed:
        return 0, f"${band:.2f} price band — race-to-the-bottom compression"
    if band < 5:
        return 3, f"${band:.2f} price band — tight pricing"
    if band < 10:
        return 6, f"${band:.2f} price band — moderate spread"
    return 8, f"${band:.2f} price band — healthy price spread"


def _f_buybox_opportunity(amazon_bb_pct: Optional[float]) -> Tuple[float, str]:
    if amazon_bb_pct is None:
        return 6, "Buy Box data unavailable — assuming 3P opportunity"
    if amazon_bb_pct < 20:  return 8, f"Amazon holds BB {amazon_bb_pct}% — strong 3P opportunity"
    if amazon_bb_pct < 40:  return 6, f"Amazon holds BB {amazon_bb_pct}% — moderate 3P opportunity"
    if amazon_bb_pct < 60:  return 4, f"Amazon holds BB {amazon_bb_pct}% — partial Amazon dominance"
    if amazon_bb_pct < 80:  return 2, f"Amazon holds BB {amazon_bb_pct}% — Amazon dominant"
    return 0, f"Amazon holds BB {amazon_bb_pct}% — Amazon locked"


def _f_promotional_pressure(lightning_deal: bool, coupon: bool) -> Tuple[float, str]:
    if not lightning_deal and not coupon:
        return 5, "No promotional activity — organic pricing"
    if lightning_deal and coupon:
        return 0, "Heavy promotional pressure (lightning deals + coupons)"
    label = "Lightning Deal activity" if lightning_deal else "Coupon pricing"
    return 2, f"Some promotional pressure — {label} detected"


def _f_seasonality(is_seasonal: bool, peak_month: Optional[str]) -> Tuple[float, str]:
    if not is_seasonal:
        return 5, "Year-round demand — lower timing risk"
    peak = f" (peak: {peak_month})" if peak_month else ""
    return 2, f"Seasonal demand{peak} — timing risk for new sellers"


def _f_profit_margin(avg_price: Optional[float]) -> Tuple[float, str]:
    """Higher price → more room for FBA fees and profit margin."""
    if not avg_price:
        return 0, "No price data"
    if avg_price >= 35: return 6, f"${avg_price:.2f} avg — strong margin potential"
    if avg_price >= 25: return 5, f"${avg_price:.2f} avg — good margin potential"
    if avg_price >= 20: return 4, f"${avg_price:.2f} avg — moderate margins"
    if avg_price >= 15: return 3, f"${avg_price:.2f} avg — tight margins"
    if avg_price >= 10: return 1, f"${avg_price:.2f} avg — very tight margins"
    return 0, f"${avg_price:.2f} avg — insufficient for profitable FBA"


# ──────────────────────────────────────────────────────────────────
# Grade and verdict
# ──────────────────────────────────────────────────────────────────

def _grade(score: float) -> Tuple[str, str]:
    if score >= 80: return "A", "Excellent Opportunity"
    if score >= 65: return "B", "Good Opportunity"
    if score >= 50: return "C", "Average Opportunity"
    if score >= 35: return "D", "Below Average"
    return "F", "Poor Opportunity"


# ──────────────────────────────────────────────────────────────────
# Per-product scorer
# ──────────────────────────────────────────────────────────────────

def score_product(
    bsr: BSRAnalysis,
    product: Dict[str, Any],
    rv: ReviewVelocityAnalysis,
    pa: PriceAnalysis,
) -> ProductScore:
    """
    Score a single product against 12 weighted factors.

    Args:
        bsr:     BSRAnalysis for this product (demand signals).
        product: Normalized product dict (current price, review count, history).
        rv:      Category-level ReviewVelocityAnalysis (accessibility signals).
        pa:      Category-level PriceAnalysis (price signals).
    """
    current      = product.get("current", {})
    price        = current.get("amazon_price") or current.get("buybox_price") or pa.category_avg_price
    review_count = current.get("review_count")
    review_hist  = product.get("history", {}).get("review_count", [])
    velocity     = _review_velocity(review_hist)
    monthly_rev  = round(bsr.estimated_monthly_sales * price, 2) if bsr.estimated_monthly_sales and price else None

    raw_factors = [
        ("demand_level",              WEIGHTS["demand_level"],
         *_f_demand_level(bsr.estimated_monthly_sales)),
        ("demand_trend",              WEIGHTS["demand_trend"],
         *_f_demand_trend(bsr.trend_direction, bsr.demand_velocity)),
        ("revenue_potential",         WEIGHTS["revenue_potential"],
         *_f_revenue_potential(bsr.estimated_monthly_sales, price)),
        ("competition_accessibility", WEIGHTS["competition_accessibility"],
         *_f_competition_accessibility(rv.accessibility_verdict)),
        ("review_barrier",            WEIGHTS["review_barrier"],
         *_f_review_barrier(review_count)),
        ("review_velocity_threat",    WEIGHTS["review_velocity_threat"],
         *_f_review_velocity_threat(velocity)),
        ("price_stability",           WEIGHTS["price_stability"],
         *_f_price_stability(pa.price_trend)),
        ("price_compression_risk",    WEIGHTS["price_compression_risk"],
         *_f_price_compression(pa.price_compression, pa.price_band_usd)),
        ("buybox_opportunity",        WEIGHTS["buybox_opportunity"],
         *_f_buybox_opportunity(pa.amazon_holds_buybox_pct)),
        ("promotional_pressure",      WEIGHTS["promotional_pressure"],
         *_f_promotional_pressure(pa.has_lightning_deal_activity, pa.coupon_price_detected)),
        ("seasonality_risk",          WEIGHTS["seasonality_risk"],
         *_f_seasonality(bsr.is_seasonal, bsr.seasonal_peak_month)),
        ("profit_margin_proxy",       WEIGHTS["profit_margin_proxy"],
         *_f_profit_margin(price)),
    ]

    factors = [
        FactorScore(name=name, weight=weight, score=pts, rationale=note)
        for name, weight, pts, note in raw_factors
    ]

    total = round(sum(f.score for f in factors), 1)
    grade, verdict = _grade(total)

    return ProductScore(
        asin=bsr.asin,
        title=bsr.title,
        total_score=total,
        grade=grade,
        verdict=verdict,
        factors=factors,
        estimated_monthly_sales=bsr.estimated_monthly_sales,
        estimated_monthly_revenue=monthly_rev,
    )


# ──────────────────────────────────────────────────────────────────
# Batch runner
# ──────────────────────────────────────────────────────────────────

def run(
    bsr_results: List[BSRAnalysis],
    normalized_products: List[Dict[str, Any]],
    rv_analysis: ReviewVelocityAnalysis,
    price_analysis: PriceAnalysis,
) -> List[ProductScore]:
    """
    Score all products. Returns list sorted by total_score descending
    (best opportunity first).
    """
    product_map = {p.get("asin"): p for p in normalized_products}

    scores = []
    for bsr in bsr_results:
        product = product_map.get(bsr.asin)
        if not product:
            continue
        try:
            scores.append(score_product(bsr, product, rv_analysis, price_analysis))
        except Exception as exc:
            print(f"  WARNING: Scoring failed for {bsr.asin}: {exc}")

    scores.sort(key=lambda s: s.total_score, reverse=True)
    return scores
