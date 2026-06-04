"""
price-history-analyzer — Phase 1 agent script.

Responsibility: convert price time-series data into margin and
competition signals.

Inputs:  normalized_products list from keepa-data-fetcher
Outputs: PriceAnalysis dataclass

Key calculations:
  - Category price range (min, max, avg, median)
  - Price band width and compression detection (band < $3 = compressed)
  - Price trend direction over 90 days
  - Buy Box ownership: Amazon vs third-party sellers
  - Promotional signal detection (sharp price drops)

No API calls. Reads only from normalized product dicts.
"""

import statistics
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from keepa.models import PriceAnalysis


# ------------------------------------------------------------------
# Price compression threshold (USD)
# Markets where the price range is under this value are flagged as
# "race-to-the-bottom" dynamics — a margin risk signal.
# ------------------------------------------------------------------
COMPRESSION_THRESHOLD_USD = 3.00

# A price drop exceeding this percentage within a 30-day window is
# treated as a promotional coupon or Lightning Deal signal.
PROMO_DROP_THRESHOLD_PCT = 0.25


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _recent_prices(
    price_history: List[Dict[str, Any]], days: int = 90
) -> List[float]:
    """Return price values from the last N days."""
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    values = []
    for entry in price_history:
        try:
            ts = datetime.fromisoformat(entry["timestamp"])
            if ts >= cutoff and entry.get("value") is not None:
                values.append(float(entry["value"]))
        except (KeyError, ValueError):
            continue
    return values


def _price_trend(prices_90d: List[float]) -> str:
    """
    Determine whether prices are Rising, Stable, or Declining over 90 days.
    Uses the simple difference between the first and last third of the period.
    """
    n = len(prices_90d)
    if n < 6:
        return "Insufficient data"

    third = n // 3
    early_avg = statistics.mean(prices_90d[:third])
    late_avg  = statistics.mean(prices_90d[n - third:])

    pct_change = (late_avg - early_avg) / early_avg if early_avg else 0

    if pct_change > 0.05:
        return "Rising"
    if pct_change < -0.05:
        return "Declining"
    return "Stable"


def _has_promo_signal(price_history: List[Dict[str, Any]]) -> bool:
    """
    Detect sudden price drops suggesting coupon or Lightning Deal activity.
    Flags if any 30-day window contains a drop > PROMO_DROP_THRESHOLD_PCT.
    """
    if len(price_history) < 4:
        return False

    prices_clean = []
    for e in price_history:
        try:
            ts = datetime.fromisoformat(e["timestamp"])
            val = float(e["value"])
            prices_clean.append((ts, val))
        except (KeyError, ValueError):
            continue

    prices_clean.sort(key=lambda x: x[0])
    for i in range(len(prices_clean) - 1):
        p1 = prices_clean[i][1]
        p2 = prices_clean[i + 1][1]
        if p1 > 0 and (p1 - p2) / p1 > PROMO_DROP_THRESHOLD_PCT:
            return True
    return False


def _buybox_amazon_pct(
    amazon_history: List[Dict[str, Any]],
    buybox_history: List[Dict[str, Any]],
) -> Optional[float]:
    """
    Estimate the percentage of time Amazon (not a third-party seller)
    holds the Buy Box, based on whether the Amazon price matches the Buy Box price.

    Returns None if insufficient data.
    This is a heuristic — direct Buy Box ownership data requires the offers API.
    """
    if not amazon_history or not buybox_history or len(buybox_history) < 5:
        return None

    # Build {timestamp: amazon_price} map from Amazon price history
    amazon_map: Dict[str, float] = {}
    for e in amazon_history:
        if e.get("value") is not None:
            amazon_map[e["timestamp"]] = float(e["value"])

    if not amazon_map:
        return None

    match_count = 0
    total = 0
    for e in buybox_history:
        if e.get("value") is None:
            continue
        bb_price = float(e["value"])
        # Find closest Amazon price by timestamp
        amz_price = amazon_map.get(e["timestamp"])
        if amz_price is not None:
            total += 1
            # Allow $0.01 tolerance for floating point
            if abs(amz_price - bb_price) < 0.02:
                match_count += 1

    if total == 0:
        return None
    return round(match_count / total * 100, 1)


def _summarize_product(product: Dict[str, Any], days: int = 90) -> Dict[str, Any]:
    """Build a compact price summary for one product."""
    asin = product.get("asin", "UNKNOWN")
    title = (product.get("title") or "")[:60]

    amz_prices = _recent_prices(product.get("history", {}).get("amazon_price", []), days)
    bb_prices  = _recent_prices(product.get("history", {}).get("buybox_price", []), days)
    prices_for_avg = amz_prices or bb_prices

    return {
        "asin": asin,
        "title": title,
        "current_amazon_price": product.get("current", {}).get("amazon_price"),
        "current_buybox_price": product.get("current", {}).get("buybox_price"),
        "avg_price_90d": round(statistics.mean(prices_for_avg), 2) if prices_for_avg else None,
        "min_price_90d": round(min(prices_for_avg), 2) if prices_for_avg else None,
        "max_price_90d": round(max(prices_for_avg), 2) if prices_for_avg else None,
        "price_trend": _price_trend(amz_prices) if amz_prices else "No data",
        "promo_detected": _has_promo_signal(product.get("history", {}).get("buybox_price", [])),
    }


# ------------------------------------------------------------------
# Main runner
# ------------------------------------------------------------------

def run(normalized_products: List[Dict[str, Any]]) -> PriceAnalysis:
    """
    Run price history analysis across all normalized products.

    Returns a PriceAnalysis instance with category-level and
    per-product price intelligence.
    """
    print(f"\n{'='*60}")
    print(f"  price-history-analyzer")
    print(f"  Analyzing {len(normalized_products)} products")
    print(f"{'='*60}")

    # Collect all current prices (Amazon price, falling back to Buy Box)
    all_current_prices: List[float] = []
    all_avg_90d_prices: List[float] = []
    promo_detected_count = 0
    buybox_pcts: List[float] = []
    price_trends: List[str] = []

    for p in normalized_products:
        current = p.get("current", {})
        cp = current.get("amazon_price") or current.get("buybox_price")
        if cp:
            all_current_prices.append(cp)

        amz_hist = p.get("history", {}).get("amazon_price", [])
        bb_hist  = p.get("history", {}).get("buybox_price", [])
        amz_prices_90d = _recent_prices(amz_hist)
        prices_90d = amz_prices_90d or _recent_prices(bb_hist)

        if prices_90d:
            all_avg_90d_prices.append(statistics.mean(prices_90d))

        if _has_promo_signal(bb_hist or amz_hist):
            promo_detected_count += 1

        bb_pct = _buybox_amazon_pct(amz_hist, bb_hist)
        if bb_pct is not None:
            buybox_pcts.append(bb_pct)

        trend = _price_trend(amz_prices_90d)
        if "data" not in trend:
            price_trends.append(trend)

    # ── Category-level aggregates ─────────────────────────────────
    cat_min   = round(min(all_current_prices), 2) if all_current_prices else None
    cat_max   = round(max(all_current_prices), 2) if all_current_prices else None
    cat_avg   = round(statistics.mean(all_current_prices), 2) if all_current_prices else None
    cat_median = round(statistics.median(all_current_prices), 2) if all_current_prices else None

    price_band = round(cat_max - cat_min, 2) if cat_max and cat_min else None
    compressed = bool(price_band and price_band < COMPRESSION_THRESHOLD_USD)

    # ── Category-wide price trend (mode of individual trends) ────
    if price_trends:
        from collections import Counter
        cat_trend = Counter(price_trends).most_common(1)[0][0]
    else:
        cat_trend = "Insufficient data"

    avg_price_delta = None
    if all_avg_90d_prices and cat_avg:
        avg_price_delta = round(cat_avg - statistics.mean(all_avg_90d_prices), 2)

    avg_bb_pct = round(statistics.mean(buybox_pcts), 1) if buybox_pcts else None

    # ── Per-product summaries (top 10 by current price desc) ─────
    products_sorted = sorted(
        normalized_products,
        key=lambda p: p.get("current", {}).get("amazon_price") or 0,
        reverse=True,
    )[:10]
    summaries = [_summarize_product(p) for p in products_sorted]

    print(f"  Price range:           ${cat_min} – ${cat_max}")
    print(f"  Avg price:             ${cat_avg}")
    print(f"  Price band:            ${price_band}  ({'COMPRESSED' if compressed else 'Healthy'})")
    print(f"  Category trend:        {cat_trend}")
    print(f"  Promo signals found:   {promo_detected_count}/{len(normalized_products)} products")
    print(f"  Amazon Buy Box avg:    {avg_bb_pct}%" if avg_bb_pct else "  Amazon Buy Box avg:    N/A")

    return PriceAnalysis(
        category_min_price=cat_min,
        category_max_price=cat_max,
        category_avg_price=cat_avg,
        category_median_price=cat_median,
        price_band_usd=price_band,
        price_compression=compressed,
        price_trend=cat_trend,
        avg_price_delta_90d=avg_price_delta,
        amazon_holds_buybox_pct=avg_bb_pct,
        has_lightning_deal_activity=promo_detected_count > 0,
        coupon_price_detected=promo_detected_count > (len(normalized_products) * 0.15),
        product_summaries=summaries,
    )
