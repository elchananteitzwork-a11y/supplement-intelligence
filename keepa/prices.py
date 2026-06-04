"""
Price history analysis.

Converts price time-series data into margin and competition signals:
category price range, compression detection, trend direction,
Buy Box ownership estimation, and promotional activity signals.
"""

import statistics
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from keepa.models import PriceAnalysis


COMPRESSION_THRESHOLD_USD = 3.00
PROMO_DROP_THRESHOLD_PCT  = 0.25


def _recent_prices(price_history: List[Dict[str, Any]], days: int = 90) -> List[float]:
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    out = []
    for entry in price_history:
        try:
            ts = datetime.fromisoformat(entry["timestamp"])
            if ts >= cutoff and entry.get("value") is not None:
                out.append(float(entry["value"]))
        except (KeyError, ValueError):
            continue
    return out


def _price_trend(prices: List[float]) -> str:
    n = len(prices)
    if n < 6:
        return "Insufficient data"
    third = n // 3
    early = statistics.mean(prices[:third])
    late  = statistics.mean(prices[n - third:])
    pct   = (late - early) / early if early else 0
    if pct > 0.05:
        return "Rising"
    if pct < -0.05:
        return "Declining"
    return "Stable"


def _has_promo_signal(price_history: List[Dict[str, Any]]) -> bool:
    """Detect a price drop > PROMO_DROP_THRESHOLD_PCT between consecutive data points."""
    if len(price_history) < 4:
        return False
    clean = []
    for e in price_history:
        try:
            clean.append((datetime.fromisoformat(e["timestamp"]), float(e["value"])))
        except (KeyError, ValueError):
            continue
    clean.sort(key=lambda x: x[0])
    for i in range(len(clean) - 1):
        p1, p2 = clean[i][1], clean[i + 1][1]
        if p1 > 0 and (p1 - p2) / p1 > PROMO_DROP_THRESHOLD_PCT:
            return True
    return False


def _buybox_amazon_pct(
    amazon_history: List[Dict[str, Any]],
    buybox_history: List[Dict[str, Any]],
) -> Optional[float]:
    """
    Heuristic: percentage of Buy Box timestamps where Amazon price == Buy Box price.
    Returns None if insufficient data.
    """
    if not amazon_history or not buybox_history or len(buybox_history) < 5:
        return None
    amazon_map = {
        e["timestamp"]: float(e["value"])
        for e in amazon_history
        if e.get("value") is not None
    }
    if not amazon_map:
        return None
    total = matches = 0
    for e in buybox_history:
        if e.get("value") is None:
            continue
        amz = amazon_map.get(e["timestamp"])
        if amz is not None:
            total += 1
            if abs(amz - float(e["value"])) < 0.02:
                matches += 1
    return round(matches / total * 100, 1) if total else None


def _product_summary(product: Dict[str, Any], days: int = 90) -> Dict[str, Any]:
    amz_prices = _recent_prices(product.get("history", {}).get("amazon_price", []), days)
    bb_prices  = _recent_prices(product.get("history", {}).get("buybox_price", []), days)
    prices     = amz_prices or bb_prices
    return {
        "asin":                product.get("asin", "UNKNOWN"),
        "title":               (product.get("title") or "")[:60],
        "current_amazon_price": product.get("current", {}).get("amazon_price"),
        "current_buybox_price": product.get("current", {}).get("buybox_price"),
        "avg_price_90d":  round(statistics.mean(prices), 2) if prices else None,
        "min_price_90d":  round(min(prices), 2) if prices else None,
        "max_price_90d":  round(max(prices), 2) if prices else None,
        "price_trend":    _price_trend(amz_prices) if amz_prices else "No data",
        "promo_detected": _has_promo_signal(product.get("history", {}).get("buybox_price", [])),
    }


def run(normalized_products: List[Dict[str, Any]]) -> PriceAnalysis:
    """Run price history analysis across all normalized products."""
    all_current: List[float] = []
    all_avg_90d: List[float] = []
    trends:      List[str]   = []
    bb_pcts:     List[float] = []
    promo_count = 0

    for p in normalized_products:
        current = p.get("current", {})
        cp = current.get("amazon_price") or current.get("buybox_price")
        if cp:
            all_current.append(cp)

        amz_hist = p.get("history", {}).get("amazon_price", [])
        bb_hist  = p.get("history", {}).get("buybox_price", [])
        amz_90d  = _recent_prices(amz_hist)
        prices_90d = amz_90d or _recent_prices(bb_hist)

        if prices_90d:
            all_avg_90d.append(statistics.mean(prices_90d))

        if _has_promo_signal(bb_hist or amz_hist):
            promo_count += 1

        bb_pct = _buybox_amazon_pct(amz_hist, bb_hist)
        if bb_pct is not None:
            bb_pcts.append(bb_pct)

        trend = _price_trend(amz_90d)
        if "data" not in trend:
            trends.append(trend)

    cat_min    = round(min(all_current), 2) if all_current else None
    cat_max    = round(max(all_current), 2) if all_current else None
    cat_avg    = round(statistics.mean(all_current), 2) if all_current else None
    cat_median = round(statistics.median(all_current), 2) if all_current else None
    price_band = round(cat_max - cat_min, 2) if cat_max and cat_min else None
    compressed = bool(price_band and price_band < COMPRESSION_THRESHOLD_USD)

    cat_trend      = Counter(trends).most_common(1)[0][0] if trends else "Insufficient data"
    avg_price_delta = (
        round(cat_avg - statistics.mean(all_avg_90d), 2)
        if all_avg_90d and cat_avg else None
    )
    avg_bb_pct = round(statistics.mean(bb_pcts), 1) if bb_pcts else None

    top10 = sorted(
        normalized_products,
        key=lambda p: p.get("current", {}).get("amazon_price") or 0,
        reverse=True,
    )[:10]

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
        has_lightning_deal_activity=promo_count > 0,
        coupon_price_detected=promo_count > (len(normalized_products) * 0.15),
        product_summaries=[_product_summary(p) for p in top10],
    )
