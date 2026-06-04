"""
review-velocity-tracker — Phase 1 agent script.

Responsibility: convert review count history into small-seller
accessibility signals and competitive proof data.

Inputs:  normalized_products + bsr_analyses (for sales estimates)
Outputs: ReviewVelocityAnalysis dataclass

Key calculations:
  - Review counts per seller tier (< 100 / < 500 / < 1,000)
  - Monthly review velocity per product
  - Estimated listing age from review history
  - Review-to-Revenue Efficiency (revenue / review_count)
  - Accessibility verdict based on tier distribution

No API calls. Reads only from normalized product dicts.
"""

import statistics
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from keepa.models import ReviewVelocityAnalysis, SellerTierEntry


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _review_velocity(review_history: List[Dict[str, Any]], days: int = 90) -> Optional[float]:
    """
    Calculate average reviews gained per month over the last N days.
    Returns None if insufficient history.
    """
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
    oldest_count = recent[0][1]
    newest_count = recent[-1][1]
    delta = max(0, newest_count - oldest_count)
    months_elapsed = days / 30.0
    return round(delta / months_elapsed, 1)


def _estimated_listing_age_months(review_history: List[Dict[str, Any]]) -> Optional[int]:
    """
    Estimate listing age by finding the earliest review count entry.
    This is a lower-bound estimate; the listing may be older if Keepa
    started tracking it after launch.
    """
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
        earliest = min(timestamps)
        now = datetime.now(tz=timezone.utc)
        return max(1, round((now - earliest).days / 30))
    except (ValueError, KeyError):
        return None


def _build_tier_entry(
    product: Dict[str, Any],
    monthly_sales_map: Dict[str, Optional[int]],
    selling_price: Optional[float],
) -> SellerTierEntry:
    """Build a SellerTierEntry from a normalized product + sales estimate."""
    asin = product.get("asin", "UNKNOWN")
    review_count = product.get("current", {}).get("review_count") or 0
    review_history = product.get("history", {}).get("review_count", [])

    velocity = _review_velocity(review_history)
    listing_age = _estimated_listing_age_months(review_history)
    monthly_sales = monthly_sales_map.get(asin)

    # Revenue and efficiency
    monthly_revenue: Optional[float] = None
    r2r_efficiency: Optional[float] = None
    if monthly_sales and selling_price:
        monthly_revenue = round(monthly_sales * selling_price, 2)
        if review_count and review_count > 0:
            r2r_efficiency = round(monthly_revenue / review_count, 2)

    return SellerTierEntry(
        asin=asin,
        title=(product.get("title") or "")[:80],
        review_count=review_count,
        monthly_review_velocity=velocity,
        estimated_monthly_sales=monthly_sales,
        estimated_monthly_revenue=monthly_revenue,
        review_to_revenue_efficiency=r2r_efficiency,
        brand=product.get("brand"),
        listing_age_months=listing_age,
    )


def _accessibility_verdict(
    tier_100: List[SellerTierEntry],
    tier_500: List[SellerTierEntry],
    tier_1000: List[SellerTierEntry],
    total_products: int,
) -> str:
    """
    Determine market accessibility based on tier distribution.
    Mirrors the logic defined in small-seller-success-detector AGENT.md.
    """
    t100_with_sales = [e for e in tier_100 if e.estimated_monthly_sales and e.estimated_monthly_sales > 50]
    t500_count = len(tier_500)
    t1000_count = len(tier_1000)

    if len(t100_with_sales) >= 3:
        return "Highly Accessible"
    if t500_count >= 5:
        return "Accessible"
    if t1000_count >= 3:
        return "Hard to Enter"
    return "Locked"


# ------------------------------------------------------------------
# Main runner
# ------------------------------------------------------------------

def run(
    normalized_products: List[Dict[str, Any]],
    bsr_analyses: Optional[List[Any]] = None,
) -> ReviewVelocityAnalysis:
    """
    Run review velocity analysis across all normalized products.

    Args:
        normalized_products: Output from keepa-data-fetcher.
        bsr_analyses:        Output from bsr-trend-analyzer (for sales estimates).
                             Optional — analysis runs without it but efficiency
                             metrics will be None.

    Returns a ReviewVelocityAnalysis instance.
    """
    print(f"\n{'='*60}")
    print(f"  review-velocity-tracker")
    print(f"  Analyzing {len(normalized_products)} products")
    print(f"{'='*60}")

    # Build ASIN → monthly_sales lookup from BSR analysis
    monthly_sales_map: Dict[str, Optional[int]] = {}
    if bsr_analyses:
        for bsr in bsr_analyses:
            monthly_sales_map[bsr.asin] = bsr.estimated_monthly_sales

    # Determine a representative selling price for the category
    prices = [
        p.get("current", {}).get("buybox_price") or p.get("current", {}).get("amazon_price")
        for p in normalized_products
        if p.get("current", {}).get("buybox_price") or p.get("current", {}).get("amazon_price")
    ]
    category_avg_price = round(sum(prices) / len(prices), 2) if prices else None

    # Collect review counts for all products
    review_counts = []
    for p in normalized_products:
        rc = p.get("current", {}).get("review_count")
        if rc is not None:
            review_counts.append(rc)

    avg_reviews = round(statistics.mean(review_counts), 1) if review_counts else None
    median_reviews = round(statistics.median(review_counts), 1) if review_counts else None
    min_reviews = min(review_counts) if review_counts else None

    # ── Build tier lists ─────────────────────────────────────────
    tier_100_entries  = []
    tier_500_entries  = []
    tier_1000_entries = []

    for p in normalized_products:
        rc = p.get("current", {}).get("review_count") or 0
        entry = _build_tier_entry(p, monthly_sales_map, category_avg_price)

        if rc < 100:
            tier_100_entries.append(entry)
        if rc < 500:
            tier_500_entries.append(entry)
        if rc < 1000:
            tier_1000_entries.append(entry)

    # Sort tiers by monthly revenue descending (best performers first)
    for tier in (tier_100_entries, tier_500_entries, tier_1000_entries):
        tier.sort(key=lambda e: e.estimated_monthly_revenue or 0, reverse=True)

    # ── Review velocity aggregates ───────────────────────────────
    velocities = []
    for p in normalized_products:
        v = _review_velocity(p.get("history", {}).get("review_count", []))
        if v is not None:
            velocities.append((p.get("asin", ""), v))

    avg_velocity = round(statistics.mean([v for _, v in velocities]), 1) if velocities else None
    fastest = max(velocities, key=lambda x: x[1]) if velocities else (None, None)

    # ── Review-to-Revenue Efficiency aggregates ──────────────────
    r2r_values = [
        (e.asin, e.review_to_revenue_efficiency)
        for tier in (tier_500_entries,)
        for e in tier
        if e.review_to_revenue_efficiency
    ]
    category_r2r_avg = (
        round(statistics.mean([v for _, v in r2r_values]), 2)
        if r2r_values else None
    )
    best_r2r = max(r2r_values, key=lambda x: x[1]) if r2r_values else (None, None)

    verdict = _accessibility_verdict(
        tier_100_entries, tier_500_entries, tier_1000_entries, len(normalized_products)
    )

    print(f"  Avg reviews (page 1):  {avg_reviews}")
    print(f"  Sellers < 100 reviews: {len(tier_100_entries)}")
    print(f"  Sellers < 500 reviews: {len(tier_500_entries)}")
    print(f"  Sellers < 1,000 reviews: {len(tier_1000_entries)}")
    print(f"  Accessibility verdict: {verdict}")

    return ReviewVelocityAnalysis(
        tier_under_100=tier_100_entries,
        tier_under_500=tier_500_entries,
        tier_under_1000=tier_1000_entries,
        avg_reviews_page1=avg_reviews,
        median_reviews_page1=median_reviews,
        min_reviews_page1=min_reviews,
        avg_monthly_velocity=avg_velocity,
        fastest_grower_asin=fastest[0],
        fastest_grower_velocity=fastest[1],
        category_avg_r2r_efficiency=category_r2r_avg,
        best_r2r_efficiency=best_r2r[1],
        best_r2r_asin=best_r2r[0],
        accessibility_verdict=verdict,
    )
