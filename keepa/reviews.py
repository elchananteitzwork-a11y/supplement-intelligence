"""
Review velocity and seller accessibility analysis.

Converts review count history into small-seller accessibility signals:
monthly velocity, seller tier breakdowns, Review-to-Revenue efficiency,
and an overall market accessibility verdict.
"""

import statistics
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from keepa.models import ReviewVelocityAnalysis, SellerTierEntry


def _review_velocity(review_history: List[Dict[str, Any]], days: int = 90) -> Optional[float]:
    """Average reviews gained per month over the last N days."""
    if len(review_history) < 2:
        return None
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    recent = []
    for entry in review_history:
        try:
            ts = datetime.fromisoformat(entry["timestamp"])
            if ts >= cutoff:
                recent.append((ts, int(entry["value"])))
        except (KeyError, ValueError):
            continue
    if len(recent) < 2:
        return None
    recent.sort(key=lambda x: x[0])
    delta = max(0, recent[-1][1] - recent[0][1])
    return round(delta / (days / 30.0), 1)


def _listing_age_months(review_history: List[Dict[str, Any]]) -> Optional[int]:
    """Lower-bound estimate of listing age from the earliest tracked review entry."""
    if not review_history:
        return None
    try:
        timestamps = [
            datetime.fromisoformat(e["timestamp"])
            for e in review_history
            if e.get("timestamp")
        ]
        if not timestamps:
            return None
        return max(1, round((datetime.now(tz=timezone.utc) - min(timestamps)).days / 30))
    except (ValueError, KeyError):
        return None


def _build_entry(
    product: Dict[str, Any],
    sales_map: Dict[str, Optional[int]],
    avg_price: Optional[float],
) -> SellerTierEntry:
    asin          = product.get("asin", "UNKNOWN")
    review_count  = product.get("current", {}).get("review_count") or 0
    review_hist   = product.get("history", {}).get("review_count", [])
    velocity      = _review_velocity(review_hist)
    age_months    = _listing_age_months(review_hist)
    monthly_sales = sales_map.get(asin)

    monthly_revenue: Optional[float] = None
    r2r: Optional[float] = None
    if monthly_sales and avg_price:
        monthly_revenue = round(monthly_sales * avg_price, 2)
        if review_count > 0:
            r2r = round(monthly_revenue / review_count, 2)

    return SellerTierEntry(
        asin=asin,
        title=(product.get("title") or "")[:80],
        review_count=review_count,
        monthly_review_velocity=velocity,
        estimated_monthly_sales=monthly_sales,
        estimated_monthly_revenue=monthly_revenue,
        review_to_revenue_efficiency=r2r,
        brand=product.get("brand"),
        listing_age_months=age_months,
    )


def _accessibility_verdict(
    tier_100: List[SellerTierEntry],
    tier_500: List[SellerTierEntry],
    tier_1000: List[SellerTierEntry],
) -> str:
    viable_under_100 = [e for e in tier_100 if e.estimated_monthly_sales and e.estimated_monthly_sales > 50]
    if len(viable_under_100) >= 3:
        return "Highly Accessible"
    if len(tier_500) >= 5:
        return "Accessible"
    if len(tier_1000) >= 3:
        return "Hard to Enter"
    return "Locked"


def run(
    normalized_products: List[Dict[str, Any]],
    bsr_analyses: Optional[List[Any]] = None,
) -> ReviewVelocityAnalysis:
    """
    Run review velocity analysis across all normalized products.

    bsr_analyses: output from keepa.bsr.run() — used for revenue estimates.
    """
    sales_map: Dict[str, Optional[int]] = {}
    if bsr_analyses:
        for b in bsr_analyses:
            sales_map[b.asin] = b.estimated_monthly_sales

    prices = [
        p.get("current", {}).get("buybox_price") or p.get("current", {}).get("amazon_price")
        for p in normalized_products
        if p.get("current", {}).get("buybox_price") or p.get("current", {}).get("amazon_price")
    ]
    avg_price = round(sum(prices) / len(prices), 2) if prices else None

    review_counts = [
        p.get("current", {}).get("review_count")
        for p in normalized_products
        if p.get("current", {}).get("review_count") is not None
    ]

    tier_100: List[SellerTierEntry]  = []
    tier_500: List[SellerTierEntry]  = []
    tier_1000: List[SellerTierEntry] = []

    for p in normalized_products:
        rc    = p.get("current", {}).get("review_count") or 0
        entry = _build_entry(p, sales_map, avg_price)
        if rc < 100:
            tier_100.append(entry)
        if rc < 500:
            tier_500.append(entry)
        if rc < 1000:
            tier_1000.append(entry)

    for tier in (tier_100, tier_500, tier_1000):
        tier.sort(key=lambda e: e.estimated_monthly_revenue or 0, reverse=True)

    velocities = [
        (p.get("asin", ""), v)
        for p in normalized_products
        for v in [_review_velocity(p.get("history", {}).get("review_count", []))]
        if v is not None
    ]
    avg_velocity = round(statistics.mean([v for _, v in velocities]), 1) if velocities else None
    fastest      = max(velocities, key=lambda x: x[1]) if velocities else (None, None)

    r2r_pairs = [
        (e.asin, e.review_to_revenue_efficiency)
        for e in tier_500
        if e.review_to_revenue_efficiency
    ]
    avg_r2r  = round(statistics.mean([v for _, v in r2r_pairs]), 2) if r2r_pairs else None
    best_r2r = max(r2r_pairs, key=lambda x: x[1]) if r2r_pairs else (None, None)

    return ReviewVelocityAnalysis(
        tier_under_100=tier_100,
        tier_under_500=tier_500,
        tier_under_1000=tier_1000,
        avg_reviews_page1=round(statistics.mean(review_counts), 1) if review_counts else None,
        median_reviews_page1=round(statistics.median(review_counts), 1) if review_counts else None,
        min_reviews_page1=min(review_counts) if review_counts else None,
        avg_monthly_velocity=avg_velocity,
        fastest_grower_asin=fastest[0],
        fastest_grower_velocity=fastest[1],
        category_avg_r2r_efficiency=avg_r2r,
        best_r2r_efficiency=best_r2r[1],
        best_r2r_asin=best_r2r[0],
        accessibility_verdict=_accessibility_verdict(tier_100, tier_500, tier_1000),
    )
