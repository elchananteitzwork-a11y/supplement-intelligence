"""
Component 3 — Listing Weakness Score (15% of Final Opportunity Score).

Higher score = weaker competitor listings = more opportunity to win with a
better listing, images, A+ content, or differentiated positioning.

Data sources:
  - Rating-based signal: LIVE (Keepa ratings)
  - Brand weakness signal: LIVE (brand name heuristics)
  - Listing completeness: STUB (pending listing scraper)
"""

from typing import Any, Dict, Optional, Tuple

from keepa.models import BSRAnalysis
from v3.components import MarketContext
from v3.models import ComponentScore, FactorDetail

WEIGHT = 0.15


def score(
    product: Dict[str, Any],
    bsr:     BSRAnalysis,
    ctx:     MarketContext,
) -> ComponentScore:
    current        = product.get("current", {})
    product_rating = current.get("rating")
    brand          = (product.get("brand") or "").strip()

    f_rating = _f_rating_gap(product_rating, ctx.avg_rating)
    f_brand  = _f_brand_weakness(brand, ctx.unknown_brand_pct)
    f_stub   = _f_listing_completeness_stub()

    raw = f_rating[0] + f_brand[0] + f_stub[0]
    score_val = min(100.0, round(raw, 1))

    conf = _confidence(product_rating, ctx.avg_rating)

    return ComponentScore(
        name="listing_weakness",
        weight=WEIGHT,
        score=score_val,
        contribution=round(score_val * WEIGHT, 2),
        factors=[
            FactorDetail("rating_gap",             40, f_rating[0], f_rating[1]),
            FactorDetail("brand_weakness",          30, f_brand[0],  f_brand[1]),
            FactorDetail("listing_completeness",    30, f_stub[0],   f_stub[1]),
        ],
        confidence=conf,
        data_sources=["keepa", "listing_scraper[stub]"],
    )


def _f_rating_gap(product_rating: Optional[float], avg_rating: Optional[float]) -> Tuple[float, str]:
    """
    Low rating = high complaint volume = real improvement opportunity.
    Uses the lower of product rating and market average rating as the signal.
    """
    signal = None
    if product_rating is not None and avg_rating is not None:
        signal = min(product_rating, avg_rating)
        label  = f"product {product_rating:.1f} / market avg {avg_rating:.1f}"
    elif product_rating is not None:
        signal = product_rating
        label  = f"product {product_rating:.1f} (no market avg)"
    elif avg_rating is not None:
        signal = avg_rating
        label  = f"market avg {avg_rating:.1f} (no product rating)"

    if signal is None:
        return 18.0, "No rating data — neutral assumption"

    if signal < 3.8:  return 40.0, f"{label} — significant complaint volume, clear opportunity"
    if signal < 4.0:  return 30.0, f"{label} — above-average complaints, differentiation opportunity"
    if signal < 4.2:  return 20.0, f"{label} — moderate complaints, incremental improvement possible"
    if signal < 4.4:  return 12.0, f"{label} — few complaints, limited listing improvement edge"
    return 5.0, f"{label} — strong ratings, listing quality barrier is high"


def _f_brand_weakness(brand: str, unknown_brand_pct: float) -> Tuple[float, str]:
    """
    Unknown/generic brands correlate with thin listings.
    Uses both the individual product's brand and the market-level unknown brand %.
    """
    product_unknown = not brand or brand.lower() in ("", "unknown", "generic")
    mkt_note = f"{unknown_brand_pct*100:.0f}% unknown brands in scan pool"

    if unknown_brand_pct >= 0.6:
        pts = 30.0
        note = f"Market dominated by unknown brands — listing quality opportunity ({mkt_note})"
    elif unknown_brand_pct >= 0.4:
        pts = 24.0
        note = f"Many unknown brands — moderate listing opportunity ({mkt_note})"
    elif unknown_brand_pct >= 0.2:
        pts = 16.0
        note = f"Some unknown brands present ({mkt_note})"
    elif unknown_brand_pct > 0:
        pts = 8.0
        note = f"Few unknown brands ({mkt_note})"
    else:
        pts = 5.0
        note = "All products have recognized brands — listings likely optimized"

    # Small bonus when this specific product has an unknown brand
    if product_unknown and pts < 30.0:
        pts = min(30.0, pts + 4.0)
        note += " | this product has no established brand"

    return pts, note


def _f_listing_completeness_stub() -> Tuple[float, str]:
    """
    STUB — returns neutral 15/30 pending listing scraper.
    Future: scrape listing for image count (main + lifestyle), A+ content
    presence, brand story, video presence, title keyword density,
    bullet point completeness, and comparison chart.
    """
    return 15.0, "STUB — listing scraper not yet integrated (neutral 50% default)"


def _confidence(product_rating: Optional[float], avg_rating: Optional[float]) -> float:
    if product_rating is not None and avg_rating is not None:
        return 55.0  # listing_completeness stub caps confidence
    if product_rating is not None or avg_rating is not None:
        return 40.0
    return 25.0
