"""
BSR trend analysis.

Converts BSR time-series data from normalized products into demand signals:
trend direction, volatility, demand velocity, seasonal patterns, and
monthly sales estimates.
"""

import statistics
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from keepa.models import BSRAnalysis
from keepa.sales_estimate import bsr_to_monthly_sales, sales_confidence


def _values_since(bsr_history: List[Dict[str, Any]], days: int) -> List[int]:
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    out = []
    for entry in bsr_history:
        try:
            ts = datetime.fromisoformat(entry["timestamp"])
            if ts >= cutoff and entry["value"] not in (None, -1):
                out.append(int(entry["value"]))
        except (KeyError, ValueError):
            continue
    return out


def _linear_slope(values: List[float]) -> Optional[float]:
    """
    Linear regression slope over the value sequence.
    Positive = BSR rising (demand declining). Negative = BSR falling (demand improving).
    """
    n = len(values)
    if n < 3:
        return None
    xs = list(range(n))
    x_mean = statistics.mean(xs)
    y_mean = statistics.mean(values)
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, values))
    denominator = sum((x - x_mean) ** 2 for x in xs)
    return numerator / denominator if denominator else 0.0


def _volatility_label(values: List[float]) -> str:
    if len(values) < 3:
        return "Unknown"
    mean = statistics.mean(values)
    if mean == 0:
        return "Unknown"
    cv = statistics.stdev(values) / mean
    if cv < 0.15:
        return "Low"
    if cv < 0.35:
        return "Medium"
    return "High"


def _seasonal_peak_month(bsr_history: List[Dict[str, Any]]) -> Optional[str]:
    """Return the calendar month with the lowest average BSR over the last year."""
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=365)
    by_month: Dict[int, List[int]] = {}
    for entry in bsr_history:
        try:
            ts = datetime.fromisoformat(entry["timestamp"])
            if ts >= cutoff and entry["value"] not in (None, -1):
                by_month.setdefault(ts.month, []).append(int(entry["value"]))
        except (KeyError, ValueError):
            continue
    if not by_month:
        return None
    month_avgs = {m: statistics.mean(vals) for m, vals in by_month.items()}
    peak_month = min(month_avgs, key=month_avgs.get)
    return datetime(2000, peak_month, 1).strftime("%B")


def analyze(product: Dict[str, Any]) -> BSRAnalysis:
    """Compute full BSR analysis for a single normalized product."""
    asin = product.get("asin", "UNKNOWN")
    title = (product.get("title") or "")[:80]
    bsr_history = product.get("history", {}).get("bsr", [])

    vals_30d  = _values_since(bsr_history, 30)
    vals_90d  = _values_since(bsr_history, 90)
    vals_365d = _values_since(bsr_history, 365)

    avg_30d  = round(statistics.mean(vals_30d),  0) if vals_30d  else None
    avg_90d  = round(statistics.mean(vals_90d),  0) if vals_90d  else None
    avg_365d = round(statistics.mean(vals_365d), 0) if vals_365d else None

    if avg_90d is None:
        avg_90d = product.get("stats_90d", {}).get("avg_bsr")

    slope      = _linear_slope([float(v) for v in vals_90d]) if vals_90d else None
    volatility = _volatility_label([float(v) for v in vals_90d]) if vals_90d else "Unknown"

    if slope is None:
        trend = "Unknown"
    elif slope < -50:
        trend = "Improving"
    elif slope > 50:
        trend = "Declining"
    else:
        trend = "Stable"

    current_bsr  = product.get("current", {}).get("bsr") or (int(avg_90d) if avg_90d else None)
    monthly_sales = bsr_to_monthly_sales(current_bsr)
    confidence   = sales_confidence(len(vals_90d), volatility)

    if avg_30d and avg_90d:
        ratio = avg_30d / avg_90d
        if ratio < 0.85:
            velocity = "Accelerating"
        elif ratio > 1.15:
            velocity = "Decelerating"
        else:
            velocity = "Stable"
    else:
        velocity = "Unknown"

    is_seasonal   = False
    seasonal_peak = None
    if vals_365d and len(vals_365d) > 30:
        min_bsr = min(vals_365d)
        max_bsr = max(vals_365d)
        if min_bsr > 0 and (max_bsr / min_bsr) > 1.6:
            is_seasonal   = True
            seasonal_peak = _seasonal_peak_month(bsr_history)

    return BSRAnalysis(
        asin=asin,
        title=title,
        avg_bsr_90d=avg_90d,
        avg_bsr_30d=avg_30d,
        avg_bsr_365d=avg_365d,
        trend_direction=trend,
        trend_slope_per_day=round(slope, 2) if slope is not None else None,
        bsr_volatility=volatility,
        bsr_std_dev=(
            round(statistics.stdev([float(v) for v in vals_90d]), 1)
            if len(vals_90d) > 1 else None
        ),
        estimated_monthly_sales=monthly_sales,
        sales_estimate_confidence=confidence,
        demand_velocity=velocity,
        is_seasonal=is_seasonal,
        seasonal_peak_month=seasonal_peak,
    )


def run(normalized_products: List[Dict[str, Any]]) -> List[BSRAnalysis]:
    """
    Run BSR analysis across all normalized products.
    Returns results sorted by avg_bsr_90d ascending (highest demand first).
    """
    results = []
    for product in normalized_products:
        try:
            results.append(analyze(product))
        except Exception as exc:
            print(f"  WARNING: BSR analysis failed for {product.get('asin')}: {exc}")
    results.sort(key=lambda x: (x.avg_bsr_90d or 9_999_999))
    return results
