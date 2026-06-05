"""
V3 scoring engine orchestrator.

Builds a MarketContext once per scan, then scores each product through all
7 components.  The engine knows nothing about Keepa internals — it works
only with normalized product dicts and pre-computed analysis objects.

Entry point:
    from v3.engine import run
    scores = run(products, bsr_results, rv_result, price_result, category_config)
"""

import statistics
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from keepa.fba import classify_size_tier, estimate_fee, net_margin_pct
from keepa.models import BSRAnalysis, PriceAnalysis, ReviewVelocityAnalysis
from keepa.sales_estimate import calibrated_monthly_sales

from v3.components import MarketContext
from v3.models import OpportunityScore

import v3.components.demand          as _demand
import v3.components.new_seller      as _new_seller
import v3.components.listing_weakness as _listing_weakness
import v3.components.trend_velocity  as _trend_velocity
import v3.components.market_saturation as _market_saturation
import v3.components.brand_expansion as _brand_expansion
import v3.components.review_integrity as _review_integrity

from v3.sources import TrendDataSource
from v3.sources.tiktok_stub         import TikTokStub
from v3.sources.google_trends_stub  import GoogleTrendsStub
from v3.sources.reddit_stub         import RedditStub
from v3.sources.pinterest_stub      import PinterestStub

if TYPE_CHECKING:
    from categories import CategoryConfig


_DEFAULT_SOURCES = [TikTokStub(), GoogleTrendsStub(), RedditStub(), PinterestStub()]

# Recommendation thresholds
_STRONG_THRESHOLD   = 72.0
_STRONG_RI_MIN      = 60.0
_STRONG_DEMAND_MIN  = 55.0
_RESEARCH_THRESHOLD = 45.0
_RESEARCH_RI_MIN    = 40.0

# Risk / competition labels
_SAT_LOW    = 65.0
_SAT_HIGH   = 40.0
_RI_HIGH    = 50.0
_RI_MED     = 70.0
_DEMAND_MED = 45.0


def run(
    products:        List[Dict[str, Any]],
    bsr_results:     List[BSRAnalysis],
    rv_result:       ReviewVelocityAnalysis,
    price_result:    PriceAnalysis,
    category_config: Optional["CategoryConfig"] = None,
    trend_sources:   Optional[List[TrendDataSource]] = None,
) -> List["OpportunityScore"]:
    """
    Score all products through the V3 engine.
    Returns a list of OpportunityScore sorted by final_score descending.
    """
    if trend_sources is None:
        trend_sources = _DEFAULT_SOURCES

    bsr_map = {b.asin: b for b in bsr_results}
    ctx = _build_market_context(products, bsr_results, rv_result, price_result, category_config)

    scores = []
    for product in products:
        asin = product.get("asin")
        bsr  = bsr_map.get(asin)
        if not bsr:
            continue
        try:
            scores.append(_score_product(product, bsr, ctx, price_result, trend_sources))
        except Exception as exc:
            print(f"  WARNING: V3 scoring failed for {asin}: {exc}")

    scores.sort(key=lambda s: s.final_score, reverse=True)
    return scores


def _build_market_context(
    products:        List[Dict[str, Any]],
    bsr_results:     List[BSRAnalysis],
    rv_result:       ReviewVelocityAnalysis,
    price_result:    PriceAnalysis,
    category_config: Optional["CategoryConfig"],
) -> MarketContext:
    bsr_map = {b.asin: b for b in bsr_results}

    # Saturation signals
    offer_counts = [
        p.get("current", {}).get("offer_count")
        for p in products
        if p.get("current", {}).get("offer_count") is not None
    ]
    avg_offer = round(statistics.mean(offer_counts), 1) if offer_counts else None

    brands = [
        (p.get("brand") or "").strip().lower()
        for p in products
    ]
    unique_brands   = len({b for b in brands if b})
    brand_ratio     = round(unique_brands / len(products), 3) if products else 0.0
    unknown_brand_n = sum(1 for b in brands if not b)
    unknown_brand_pct = round(unknown_brand_n / len(products), 3) if products else 0.0

    # New seller success signals
    low_review_winners = sum(
        1
        for p in products
        for b in [bsr_map.get(p.get("asin"))]
        if b and (b.avg_bsr_90d or 99999) < 3000
        and (p.get("current", {}).get("review_count") or 9999) < 100
    )

    low_review_velocities = []
    for p in products:
        rc = p.get("current", {}).get("review_count") or 9999
        if rc >= 100:
            continue
        hist    = p.get("history", {}).get("review_count", [])
        vel     = _review_velocity(hist)
        if vel is not None:
            low_review_velocities.append(vel)
    avg_vel_low = round(statistics.mean(low_review_velocities), 1) if low_review_velocities else None

    # R2R from the market-level rv_result (pre-computed by keepa.reviews)
    best_r2r = rv_result.best_r2r_efficiency
    avg_r2r  = rv_result.category_avg_r2r_efficiency

    # Listing weakness signals
    ratings = [
        p.get("current", {}).get("rating")
        for p in products
        if p.get("current", {}).get("rating") is not None
    ]
    avg_rating = round(statistics.mean(ratings), 2) if ratings else None

    # Brand expansion signals
    seasonal_count = sum(
        1 for b in bsr_results if b.is_seasonal
    )
    seasonal_pct = round(seasonal_count / len(bsr_results), 3) if bsr_results else 0.0

    cal_sales_list = [
        calibrated_monthly_sales(b.avg_bsr_90d, None)  # category not needed for median
        for b in bsr_results
        if b.avg_bsr_90d is not None
    ]
    cal_sales_list = [s for s in cal_sales_list if s is not None]
    median_cal = int(statistics.median(cal_sales_list)) if cal_sales_list else None

    expansion_potential = getattr(category_config, "expansion_potential", 50) if category_config else 50

    return MarketContext(
        avg_offer_count=avg_offer,
        unique_brand_ratio=brand_ratio,
        amazon_bb_pct=price_result.amazon_holds_buybox_pct,
        price_band_usd=price_result.price_band_usd,
        price_compressed=price_result.price_compression,
        low_review_winners=low_review_winners,
        avg_velocity_low_review=avg_vel_low,
        best_r2r_efficiency=best_r2r,
        avg_r2r_efficiency=avg_r2r,
        avg_rating=avg_rating,
        unknown_brand_pct=unknown_brand_pct,
        seasonal_pct=seasonal_pct,
        median_cal_sales=median_cal,
        expansion_potential=expansion_potential,
        category_avg_price=price_result.category_avg_price,
    )


def _score_product(
    product:        Dict[str, Any],
    bsr:            BSRAnalysis,
    ctx:            MarketContext,
    price_result:   PriceAnalysis,
    trend_sources:  List[TrendDataSource],
) -> OpportunityScore:
    current = product.get("current", {})
    pkg     = product.get("package", {}) or {}
    price   = current.get("price") or ctx.category_avg_price

    # Run all 7 components
    c_demand    = _demand.score(product, bsr, ctx, price_result)
    c_new_sell  = _new_seller.score(product, bsr, ctx)
    c_listing   = _listing_weakness.score(product, bsr, ctx)
    c_trend     = _trend_velocity.score(product, bsr, ctx, trend_sources)
    c_saturation = _market_saturation.score(product, bsr, ctx, price_result)
    c_brand     = _brand_expansion.score(product, bsr, ctx)
    c_integrity = _review_integrity.score(product, bsr, ctx)

    final = round(
        c_demand.score     * c_demand.weight
        + c_new_sell.score  * c_new_sell.weight
        + c_listing.score   * c_listing.weight
        + c_trend.score     * c_trend.weight
        + c_saturation.score * c_saturation.weight
        + c_brand.score     * c_brand.weight
        + c_integrity.score * c_integrity.weight,
        1,
    )

    # Aggregate confidence (weighted average of component confidences)
    conf = round(
        (c_demand.confidence * 0.25
         + c_new_sell.confidence * 0.20
         + c_listing.confidence * 0.15
         + c_trend.confidence * 0.15
         + c_saturation.confidence * 0.10
         + c_brand.confidence * 0.10
         + c_integrity.confidence * 0.05),
        1,
    )

    # FBA economics
    tier    = classify_size_tier(pkg.get("height_mm"), pkg.get("width_mm"),
                                  pkg.get("length_mm"), pkg.get("weight_g"))
    fba_fee = estimate_fee(tier, pkg.get("weight_g"), pkg.get("height_mm"),
                            pkg.get("width_mm"), pkg.get("length_mm"))
    margin  = net_margin_pct(price, fba_fee) if (price and fba_fee) else None

    # Sales / revenue
    cal_sales = calibrated_monthly_sales(bsr.avg_bsr_90d, product.get("root_category"))
    monthly_rev = round(cal_sales * price, 2) if (cal_sales and price) else None

    # Wipe data from integrity component (surfaced at top level)
    wipe_count, wipe_detail = _review_integrity.detect_wipes(product)

    recommendation = _recommend(final, c_integrity.score, c_demand.score)
    competition    = _competition_label(c_saturation.score)
    risk           = _risk_label(c_integrity.score, c_demand.score, bsr.trend_direction)

    return OpportunityScore(
        asin=bsr.asin,
        title=bsr.title,
        brand=product.get("brand"),
        demand=c_demand,
        new_seller=c_new_sell,
        listing_weakness=c_listing,
        trend_velocity=c_trend,
        market_saturation=c_saturation,
        brand_expansion=c_brand,
        review_integrity=c_integrity,
        final_score=final,
        confidence=conf,
        estimated_monthly_sales=cal_sales,
        estimated_monthly_revenue=monthly_rev,
        price=price,
        fba_size_tier=tier,
        fba_fee=fba_fee,
        net_margin_pct=margin,
        wipe_events=wipe_count,
        wipe_detail=wipe_detail,
        competition_level=competition,
        risk_level=risk,
        recommendation=recommendation,
    )


def _recommend(final: float, ri: float, demand: float) -> str:
    if ri < _RESEARCH_RI_MIN:
        return "REJECT"
    if final >= _STRONG_THRESHOLD and ri >= _STRONG_RI_MIN and demand >= _STRONG_DEMAND_MIN:
        return "STRONG OPPORTUNITY"
    if final >= _RESEARCH_THRESHOLD:
        return "WORTH RESEARCH"
    return "REJECT"


def _competition_label(saturation_score: float) -> str:
    if saturation_score >= _SAT_LOW:
        return "Low"
    if saturation_score >= _SAT_HIGH:
        return "Medium"
    return "High"


def _risk_label(ri: float, demand: float, trend: str) -> str:
    if ri < _RI_HIGH or trend == "Declining":
        return "High"
    if ri < _RI_MED or demand < _DEMAND_MED:
        return "Medium"
    return "Low"


def _review_velocity(review_history: list, days: int = 90):
    """Minimal velocity helper (avoids circular import with keepa.reviews)."""
    from datetime import datetime, timezone, timedelta
    if len(review_history) < 2:
        return None
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    recent = []
    for e in review_history:
        try:
            ts = datetime.fromisoformat(e["timestamp"])
            if ts >= cutoff:
                recent.append((ts, int(e["value"])))
        except (KeyError, ValueError):
            continue
    if len(recent) < 2:
        return None
    recent.sort(key=lambda x: x[0])
    delta = max(0, recent[-1][1] - recent[0][1])
    return round(delta / (days / 30.0), 1)
