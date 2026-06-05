"""
Component 6 — Brand Expansion Score (10% of Final Opportunity Score).

Evaluates whether this product can become the anchor of a multi-product brand
vs. remaining a single-SKU commodity.

High scores favor:
  - Higher price points (more margin for brand investment)
  - Evergreen demand (year-round brand revenue, not seasonal)
  - Large markets (room for the brand to grow)
  - Categories with natural product line expansion (supplements > kitchen tools)
"""

from typing import Any, Dict, Tuple

from keepa.models import BSRAnalysis
from v3.components import MarketContext
from v3.models import ComponentScore, FactorDetail

WEIGHT = 0.10


def score(
    product: Dict[str, Any],
    bsr:     BSRAnalysis,
    ctx:     MarketContext,
) -> ComponentScore:
    f_price    = _f_price_tier(ctx.category_avg_price)
    f_evergreen = _f_evergreen(ctx.seasonal_pct)
    f_market   = _f_market_size(ctx.median_cal_sales)
    f_cat      = _f_category_potential(ctx.expansion_potential)

    raw = f_price[0] + f_evergreen[0] + f_market[0] + f_cat[0]
    score_val = min(100.0, round(raw, 1))

    conf = _confidence(ctx.category_avg_price, ctx.median_cal_sales)

    return ComponentScore(
        name="brand_expansion",
        weight=WEIGHT,
        score=score_val,
        contribution=round(score_val * WEIGHT, 2),
        factors=[
            FactorDetail("price_tier",           25, f_price[0],     f_price[1]),
            FactorDetail("evergreen_demand",      25, f_evergreen[0], f_evergreen[1]),
            FactorDetail("market_size",           25, f_market[0],    f_market[1]),
            FactorDetail("category_potential",    25, f_cat[0],       f_cat[1]),
        ],
        confidence=conf,
        data_sources=["keepa", "category_config"],
    )


def _f_price_tier(avg_price) -> Tuple[float, str]:
    """Higher price → more margin available for branding investment."""
    if avg_price is None:
        return 12.0, "No price data — neutral assumption"
    note = f"Category avg price ${avg_price:.2f}"
    if avg_price >= 40: return 25.0, note + " — strong brand margin available"
    if avg_price >= 30: return 20.0, note + " — good brand margin"
    if avg_price >= 20: return 14.0, note + " — adequate brand margin"
    if avg_price >= 15: return  8.0, note + " — tight margin for branding"
    return 4.0, note + " — insufficient margin to build brand premium"


def _f_evergreen(seasonal_pct: float) -> Tuple[float, str]:
    """Year-round demand = stable revenue base = brand can invest consistently."""
    note = f"{seasonal_pct*100:.0f}% of scan products marked seasonal"
    if seasonal_pct < 0.20: return 25.0, note + " — evergreen category"
    if seasonal_pct < 0.40: return 18.0, note + " — mostly evergreen with seasonal spikes"
    if seasonal_pct < 0.60: return 10.0, note + " — mixed seasonality"
    return 5.0, note + " — heavily seasonal — brand income unreliable year-round"


def _f_market_size(median_cal_sales) -> Tuple[float, str]:
    """Larger market = more room for brand to capture meaningful share."""
    if median_cal_sales is None:
        return 12.0, "No sales data — neutral assumption"
    note = f"Median {median_cal_sales:,} units/mo across scan pool"
    if median_cal_sales >= 500: return 25.0, note + " — large market"
    if median_cal_sales >= 300: return 20.0, note + " — good-sized market"
    if median_cal_sales >= 150: return 14.0, note + " — moderate market"
    if median_cal_sales >= 75:  return  8.0, note + " — small market"
    return 4.0, note + " — niche market — limited brand ceiling"


def _f_category_potential(expansion_potential: int) -> Tuple[float, str]:
    """
    CategoryConfig.expansion_potential (0–100) reflects how naturally a category
    lends itself to multi-product brands.
    Supplements (90) and Beauty (80) expand easily.
    Kitchen tools (60) have moderate expansion potential.
    """
    pts = round(expansion_potential * 25 / 100, 1)
    return pts, f"Category expansion potential: {expansion_potential}/100 → {pts:.1f}/25 pts"


def _confidence(avg_price, median_sales) -> float:
    if avg_price is not None and median_sales is not None:
        return 65.0
    if avg_price is not None or median_sales is not None:
        return 45.0
    return 25.0
