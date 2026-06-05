"""Component 1 — Demand Score (25% of Final Opportunity Score)."""

from typing import Any, Dict, Optional, Tuple

from keepa.fba import estimate_fee, classify_size_tier, net_margin_pct
from keepa.models import BSRAnalysis, PriceAnalysis
from keepa.sales_estimate import calibrated_monthly_sales
from v3.components import MarketContext
from v3.models import ComponentScore, FactorDetail

WEIGHT = 0.25


def score(
    product: Dict[str, Any],
    bsr:     BSRAnalysis,
    ctx:     MarketContext,
    price_analysis: PriceAnalysis,
) -> ComponentScore:
    current   = product.get("current", {})
    pkg       = product.get("package", {}) or {}
    bsr_hist  = product.get("history", {}).get("bsr", [])
    price     = current.get("price") or ctx.category_avg_price

    cal_sales = calibrated_monthly_sales(bsr.avg_bsr_90d, product.get("root_category"))

    f_sales  = _f_monthly_sales(cal_sales, bsr.sales_estimate_confidence)
    f_trend  = _f_trend(bsr.trend_direction, bsr.demand_velocity, len(bsr_hist))
    f_consist = _f_consistency(bsr.bsr_volatility)
    f_price  = _f_price_stability(price_analysis.price_trend)

    raw = f_sales[0] + f_trend[0] + f_consist[0] + f_price[0]
    score_val = min(100.0, round(raw, 1))

    conf = _confidence(len(bsr_hist), bsr.sales_estimate_confidence)

    return ComponentScore(
        name="demand",
        weight=WEIGHT,
        score=score_val,
        contribution=round(score_val * WEIGHT, 2),
        factors=[
            FactorDetail("monthly_sales",      40, f_sales[0],   f_sales[1]),
            FactorDetail("bsr_trend_velocity", 25, f_trend[0],   f_trend[1]),
            FactorDetail("demand_consistency", 20, f_consist[0], f_consist[1]),
            FactorDetail("price_stability",    15, f_price[0],   f_price[1]),
        ],
        confidence=conf,
        data_sources=["keepa"],
    )


def _f_monthly_sales(
    cal_sales: Optional[int],
    confidence: int,
) -> Tuple[float, str]:
    if not cal_sales:
        return 0.0, "No sales estimate — insufficient BSR history"
    note = f"{cal_sales:,} units/mo (calibrated)"
    if cal_sales >= 1000: pts = 40.0
    elif cal_sales >= 500:  pts = 32.0
    elif cal_sales >= 300:  pts = 24.0
    elif cal_sales >= 200:  pts = 16.0
    elif cal_sales >= 100:  pts =  8.0
    elif cal_sales >= 50:   pts =  4.0
    else:                   pts =  0.0
    if confidence < 40:
        pts = max(0.0, pts - 4.0)
        note += " [low-confidence estimate]"
    return pts, note


def _f_trend(trend: str, velocity: str, bsr_hist_len: int) -> Tuple[float, str]:
    table = {
        ("Improving", "Accelerating"): (25.0, "Demand rising and accelerating"),
        ("Improving", "Stable"):        (20.0, "Demand improving, velocity stable"),
        ("Improving", "Decelerating"):  (16.0, "Demand improving but slowing"),
        ("Improving", "Unknown"):       (18.0, "Demand improving"),
        ("Stable",    "Accelerating"):  (15.0, "Stable demand, acceleration signal"),
        ("Stable",    "Stable"):        (12.0, "Stable demand"),
        ("Stable",    "Decelerating"):  ( 8.0, "Stable but decelerating"),
        ("Stable",    "Unknown"):       (10.0, "Stable demand"),
        ("Declining", "Accelerating"):  ( 5.0, "Declining — brief acceleration signal"),
        ("Declining", "Stable"):        ( 3.0, "Declining demand"),
        ("Declining", "Decelerating"):  ( 0.0, "Declining and decelerating"),
        ("Declining", "Unknown"):       ( 3.0, "Declining demand"),
    }
    pts, note = table.get((trend, velocity), (5.0, f"Trend: {trend} / Velocity: {velocity}"))
    if bsr_hist_len < 5:
        pts = max(0.0, pts - 3.0)
        note += f" [thin history: {bsr_hist_len} pts]"
    return pts, note


def _f_consistency(volatility: str) -> Tuple[float, str]:
    return {
        "Low":     (20.0, "Low BSR volatility — reliable, predictable demand"),
        "Medium":  (12.0, "Medium volatility — some demand variability"),
        "High":    ( 5.0, "High volatility — demand is inconsistent"),
        "Unknown": (10.0, "Volatility unknown — insufficient history"),
    }.get(volatility, (10.0, f"Volatility: {volatility}"))


def _f_price_stability(price_trend: str) -> Tuple[float, str]:
    return {
        "Rising":            (15.0, "Prices rising — market has pricing power"),
        "Stable":            (12.0, "Prices stable — predictable margins"),
        "Declining":         ( 3.0, "Prices declining — margin erosion risk"),
        "Insufficient data": ( 7.0, "Insufficient price history"),
    }.get(price_trend, (7.0, f"Price trend: {price_trend}"))


def _confidence(bsr_hist_len: int, sales_confidence: int) -> float:
    if bsr_hist_len >= 20 and sales_confidence >= 60:
        return 80.0
    if bsr_hist_len >= 10:
        return 60.0
    if bsr_hist_len >= 5:
        return 40.0
    return 20.0
