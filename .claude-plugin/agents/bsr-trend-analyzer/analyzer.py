"""
bsr-trend-analyzer — Phase 1 agent script.

Responsibility: convert raw BSR time-series data into demand signals.

Inputs:  normalized_products list from keepa-data-fetcher
Outputs: list of BSRAnalysis objects + summary statistics

Key calculations:
  - 30/90/365-day BSR averages from history
  - Trend direction (Improving/Stable/Declining) via linear regression slope
  - BSR volatility (coefficient of variation of BSR values)
  - Monthly sales estimate via BSR-to-sales conversion table
  - Demand velocity (Accelerating/Stable/Decelerating)
  - Seasonal pattern detection (BSR variance by month)

No API calls. Reads only from normalized product dicts.
"""

import math
import statistics
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from keepa.models import BSRAnalysis


# ------------------------------------------------------------------
# BSR → Monthly Sales conversion table (Amazon US, general categories)
#
# Based on publicly documented BSR-to-sales velocity benchmarks.
# These rates vary by category. A calibration multiplier per category
# should be applied in Phase 5 after live data validation.
#
# Format: (bsr_upper_bound, monthly_sales_estimate)
# ------------------------------------------------------------------
BSR_SALES_TABLE: List[Tuple[int, int]] = [
    (50,       12000),
    (100,       8000),
    (200,       5000),
    (500,       2500),
    (1_000,     1200),
    (2_000,      700),
    (5_000,      350),
    (10_000,     170),
    (20_000,      80),
    (50_000,      30),
    (100_000,     10),
    (250_000,      4),
    (500_000,      2),
    (1_000_000,    1),
]


def bsr_to_monthly_sales(bsr: Optional[int]) -> Optional[int]:
    """
    Estimate monthly unit sales from a BSR value using piecewise interpolation.
    Returns None if BSR is missing or > 1,000,000.

    This function uses log-linear interpolation between known data points
    to smooth out the conversion rather than using step-function buckets.
    """
    if not bsr or bsr <= 0:
        return None
    if bsr > 1_000_000:
        return 1

    # Find surrounding bracket
    prev_bsr, prev_sales = 1, BSR_SALES_TABLE[0][1] * 2
    for upper_bsr, sales_at_upper in BSR_SALES_TABLE:
        if bsr <= upper_bsr:
            # Log-linear interpolation
            if prev_bsr == upper_bsr:
                return sales_at_upper
            log_ratio = math.log(bsr / prev_bsr) / math.log(upper_bsr / prev_bsr)
            log_sales = math.log(prev_sales) + log_ratio * (math.log(sales_at_upper) - math.log(prev_sales))
            return max(1, round(math.exp(log_sales)))
        prev_bsr, prev_sales = upper_bsr, sales_at_upper

    return 1


def _extract_bsr_values_since(
    bsr_history: List[Dict[str, Any]],
    days: int,
) -> List[int]:
    """Extract BSR values from the last N days of history."""
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    values = []
    for entry in bsr_history:
        try:
            ts = datetime.fromisoformat(entry["timestamp"])
            if ts >= cutoff and entry["value"] not in (None, -1):
                values.append(int(entry["value"]))
        except (KeyError, ValueError):
            continue
    return values


def _linear_slope(values: List[float]) -> Optional[float]:
    """
    Return the slope of a simple linear regression through the values.
    Positive slope = BSR increasing (demand DECLINING).
    Negative slope = BSR decreasing (demand IMPROVING).
    Returns None if fewer than 3 points.
    """
    n = len(values)
    if n < 3:
        return None
    xs = list(range(n))
    x_mean = statistics.mean(xs)
    y_mean = statistics.mean(values)
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, values))
    denominator = sum((x - x_mean) ** 2 for x in xs)
    if denominator == 0:
        return 0.0
    return numerator / denominator


def _volatility_label(values: List[float]) -> str:
    """Classify BSR volatility by coefficient of variation (CV = std/mean)."""
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


def analyze_bsr(product: Dict[str, Any]) -> BSRAnalysis:
    """
    Run full BSR analysis for a single normalized product.
    Returns a BSRAnalysis dataclass instance.
    """
    asin = product.get("asin", "UNKNOWN")
    title = (product.get("title") or "")[:80]
    bsr_history = product.get("history", {}).get("bsr", [])

    # ── Per-window averages ──────────────────────────────────────
    vals_30d  = _extract_bsr_values_since(bsr_history, 30)
    vals_90d  = _extract_bsr_values_since(bsr_history, 90)
    vals_365d = _extract_bsr_values_since(bsr_history, 365)

    avg_30d  = round(statistics.mean(vals_30d),  0) if vals_30d  else None
    avg_90d  = round(statistics.mean(vals_90d),  0) if vals_90d  else None
    avg_365d = round(statistics.mean(vals_365d), 0) if vals_365d else None

    # Fall back to Keepa's pre-computed stats if no history
    if avg_90d is None:
        stats_90d = product.get("stats_90d", {})
        avg_90d = stats_90d.get("avg_bsr")

    # ── Trend direction ──────────────────────────────────────────
    slope = _linear_slope([float(v) for v in vals_90d]) if vals_90d else None

    if slope is None:
        trend = "Unknown"
    elif slope < -50:    # BSR falling fast = demand improving
        trend = "Improving"
    elif slope > 50:     # BSR rising fast = demand declining
        trend = "Declining"
    else:
        trend = "Stable"

    # ── Volatility ───────────────────────────────────────────────
    volatility = _volatility_label([float(v) for v in vals_90d]) if vals_90d else "Unknown"

    # ── Monthly sales estimate ───────────────────────────────────
    current_bsr = product.get("current", {}).get("bsr") or (
        int(avg_90d) if avg_90d else None
    )
    monthly_sales = bsr_to_monthly_sales(current_bsr)

    # Confidence is lower when history is thin or volatility is high
    if len(vals_90d) >= 20 and volatility == "Low":
        confidence = 78
    elif len(vals_90d) >= 10:
        confidence = 60
    elif avg_90d:
        confidence = 40   # relying on Keepa pre-computed stat, no raw history
    else:
        confidence = 15

    # ── Demand velocity (comparing 30d vs 90d avg BSR) ──────────
    if avg_30d and avg_90d:
        ratio = avg_30d / avg_90d
        if ratio < 0.85:   # recent BSR much lower = accelerating demand
            velocity = "Accelerating"
        elif ratio > 1.15: # recent BSR much higher = decelerating demand
            velocity = "Decelerating"
        else:
            velocity = "Stable"
    else:
        velocity = "Unknown"

    # ── Seasonal detection (variance by month) ───────────────────
    # Simple heuristic: if 365d data exists and BSR varies by > 60% peak-to-trough
    is_seasonal = False
    seasonal_peak = None
    if vals_365d and len(vals_365d) > 30:
        min_bsr = min(vals_365d)
        max_bsr = max(vals_365d)
        if min_bsr > 0 and (max_bsr / min_bsr) > 1.6:
            is_seasonal = True
            # The lowest BSR (peak sales) corresponds to peak demand season
            # Without timestamps attached to these values we flag it as detected
            seasonal_peak = "Detected — review history timestamps for exact months"

    return BSRAnalysis(
        asin=asin,
        title=title,
        avg_bsr_90d=avg_90d,
        avg_bsr_30d=avg_30d,
        avg_bsr_365d=avg_365d,
        trend_direction=trend,
        trend_slope_per_day=round(slope, 2) if slope else None,
        bsr_volatility=volatility,
        bsr_std_dev=round(statistics.stdev([float(v) for v in vals_90d]), 1) if len(vals_90d) > 1 else None,
        estimated_monthly_sales=monthly_sales,
        sales_estimate_confidence=confidence,
        demand_velocity=velocity,
        is_seasonal=is_seasonal,
        seasonal_peak_month=seasonal_peak,
    )


def run(normalized_products: List[Dict[str, Any]]) -> List[BSRAnalysis]:
    """
    Run BSR analysis across all normalized products.
    Returns a list of BSRAnalysis objects, sorted by avg_bsr_90d ascending
    (best demand first).
    """
    print(f"\n{'='*60}")
    print(f"  bsr-trend-analyzer")
    print(f"  Analyzing {len(normalized_products)} products")
    print(f"{'='*60}")

    results = []
    for product in normalized_products:
        try:
            analysis = analyze_bsr(product)
            results.append(analysis)
        except Exception as exc:
            print(f"  WARNING: BSR analysis failed for {product.get('asin')}: {exc}")

    # Sort: best BSR (lowest number) first — highest demand at top
    results.sort(key=lambda x: (x.avg_bsr_90d or 9_999_999))

    improving = sum(1 for r in results if r.trend_direction == "Improving")
    accelerating = sum(1 for r in results if r.demand_velocity == "Accelerating")
    seasonal = sum(1 for r in results if r.is_seasonal)

    print(f"  Analyzed: {len(results)}")
    print(f"  Improving trend: {improving}  |  Accelerating demand: {accelerating}  |  Seasonal: {seasonal}")

    return results
