"""
V4 scoring engine orchestrator.

Inherits all 6 Amazon-validation components from V3 unchanged.
Adds: trend_intelligence, anti_hype, opportunity_gap, narrative generation.

Entry point:
    from v4.engine import run
    scores = run(products, bsr_results, rv_result, price_result, category_config, trend_sources)
"""

import statistics
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from keepa.fba import classify_size_tier, estimate_fee, net_margin_pct
from keepa.models import BSRAnalysis, PriceAnalysis, ReviewVelocityAnalysis
from keepa.sales_estimate import calibrated_monthly_sales

# V3 Amazon-validation components — imported unchanged
from v3.components import MarketContext as _V3Context
import v3.components.demand          as _demand
import v3.components.new_seller      as _new_seller
import v3.components.listing_weakness as _listing_weakness
import v3.components.market_saturation as _market_saturation
import v3.components.brand_expansion as _brand_expansion
import v3.components.review_integrity as _review_integrity

# V4 components
from v4.components import MarketContext
from v4.components import trend_intelligence as _trend_intel
from v4.components import opportunity_gap as _opp_gap
from v4.models import ProductNarrative, TrendBreakdown, V4OpportunityScore
from v4.sources import TrendDataSourceV4
from v4.sources.google_trends_stub  import GoogleTrendsStub
from v4.sources.tiktok_stub         import TikTokStub
from v4.sources.reddit_stub         import RedditStub
from v4.sources.pinterest_stub      import PinterestStub
from v4.sources.etsy_stub           import EtsyStub

if TYPE_CHECKING:
    from categories import CategoryConfig

_DEFAULT_SOURCES = [GoogleTrendsStub(), TikTokStub(), RedditStub(), PinterestStub(), EtsyStub()]

# Score thresholds
_STRONG_FINAL   = 72.0
_STRONG_RI      = 60.0
_STRONG_DEMAND  = 55.0
_STRONG_TREND   = 45.0   # neutral stubs (50) always pass this gate
_RESEARCH_FINAL = 45.0
_RESEARCH_RI    = 40.0


def run(
    products:        List[Dict[str, Any]],
    bsr_results:     List[BSRAnalysis],
    rv_result:       ReviewVelocityAnalysis,
    price_result:    PriceAnalysis,
    category_config: Optional["CategoryConfig"] = None,
    trend_sources:   Optional[List[TrendDataSourceV4]] = None,
) -> List[V4OpportunityScore]:
    if trend_sources is None:
        trend_sources = _DEFAULT_SOURCES

    bsr_map = {b.asin: b for b in bsr_results}
    ctx = _build_context(products, bsr_results, rv_result, price_result, category_config, trend_sources)

    scores = []
    for product in products:
        asin = product.get("asin")
        bsr  = bsr_map.get(asin)
        if not bsr:
            continue
        try:
            scores.append(_score_product(product, bsr, ctx, price_result, trend_sources))
        except Exception as exc:
            print(f"  WARNING: V4 scoring failed for {asin}: {exc}")

    scores.sort(key=lambda s: s.final_score, reverse=True)
    return scores


def _build_context(
    products:        List[Dict[str, Any]],
    bsr_results:     List[BSRAnalysis],
    rv_result:       ReviewVelocityAnalysis,
    price_result:    PriceAnalysis,
    category_config: Optional["CategoryConfig"],
    trend_sources:   List[TrendDataSourceV4],
) -> MarketContext:
    bsr_map = {b.asin: b for b in bsr_results}

    offer_counts = [
        p.get("current", {}).get("offer_count")
        for p in products
        if p.get("current", {}).get("offer_count") is not None
    ]
    avg_offer = round(statistics.mean(offer_counts), 1) if offer_counts else None

    brands = [(p.get("brand") or "").strip().lower() for p in products]
    unique_brands   = len({b for b in brands if b})
    brand_ratio     = round(unique_brands / len(products), 3) if products else 0.0
    unknown_n       = sum(1 for b in brands if not b)
    unknown_pct     = round(unknown_n / len(products), 3) if products else 0.0

    low_review_winners = sum(
        1
        for p in products
        for b in [bsr_map.get(p.get("asin"))]
        if b and (b.avg_bsr_90d or 99999) < 3000
        and (p.get("current", {}).get("review_count") or 9999) < 100
    )

    low_vel = []
    for p in products:
        if (p.get("current", {}).get("review_count") or 9999) >= 100:
            continue
        v = _review_velocity(p.get("history", {}).get("review_count", []))
        if v is not None:
            low_vel.append(v)
    avg_vel_low = round(statistics.mean(low_vel), 1) if low_vel else None

    ratings = [
        p.get("current", {}).get("rating")
        for p in products
        if p.get("current", {}).get("rating") is not None
    ]
    avg_rating = round(statistics.mean(ratings), 2) if ratings else None

    seasonal_count = sum(1 for b in bsr_results if b.is_seasonal)
    seasonal_pct   = round(seasonal_count / len(bsr_results), 3) if bsr_results else 0.0

    cal_list = [
        calibrated_monthly_sales(b.avg_bsr_90d, None)
        for b in bsr_results if b.avg_bsr_90d is not None
    ]
    cal_list = [s for s in cal_list if s]
    median_cal = int(statistics.median(cal_list)) if cal_list else None

    expansion = getattr(category_config, "expansion_potential", 50) if category_config else 50

    return MarketContext(
        avg_offer_count=avg_offer,
        unique_brand_ratio=brand_ratio,
        amazon_bb_pct=price_result.amazon_holds_buybox_pct,
        price_band_usd=price_result.price_band_usd,
        price_compressed=price_result.price_compression,
        low_review_winners=low_review_winners,
        avg_velocity_low_review=avg_vel_low,
        best_r2r_efficiency=rv_result.best_r2r_efficiency,
        avg_r2r_efficiency=rv_result.category_avg_r2r_efficiency,
        avg_rating=avg_rating,
        unknown_brand_pct=unknown_pct,
        seasonal_pct=seasonal_pct,
        median_cal_sales=median_cal,
        expansion_potential=expansion,
        category_avg_price=price_result.category_avg_price,
        trend_signals_available=any(s.is_available for s in trend_sources),
    )


def _score_product(
    product:       Dict[str, Any],
    bsr:           BSRAnalysis,
    ctx:           MarketContext,
    price_result:  PriceAnalysis,
    trend_sources: List[TrendDataSourceV4],
) -> V4OpportunityScore:
    current = product.get("current", {})
    pkg     = product.get("package", {}) or {}
    price   = current.get("price") or ctx.category_avg_price

    # ── V3 components (unchanged) ────────────────────────────────────────────
    c_demand    = _demand.score(product, bsr, ctx, price_result)
    c_new_sell  = _new_seller.score(product, bsr, ctx)
    c_listing   = _listing_weakness.score(product, bsr, ctx)
    c_saturation = _market_saturation.score(product, bsr, ctx, price_result)
    c_brand     = _brand_expansion.score(product, bsr, ctx)
    c_integrity = _review_integrity.score(product, bsr, ctx)

    # ── V4 components ────────────────────────────────────────────────────────
    c_trend, trend_breakdown = _trend_intel.score(product, bsr, ctx, trend_sources)

    gap_score, gap_bonus, gap_narrative = _opp_gap.compute(
        trend_velocity=c_trend.score,
        market_saturation=c_saturation.score,
        demand_score=c_demand.score,
        authenticity_score=trend_breakdown.authenticity_score,
        all_stubs=trend_breakdown.all_stubs,
    )

    # ── Final score ──────────────────────────────────────────────────────────
    base = round(
        c_demand.score     * c_demand.weight
        + c_new_sell.score  * c_new_sell.weight
        + c_listing.score   * c_listing.weight
        + c_trend.score     * c_trend.weight
        + c_saturation.score * c_saturation.weight
        + c_brand.score     * c_brand.weight
        + c_integrity.score * c_integrity.weight,
        1,
    )
    final = min(100.0, round(base + gap_bonus, 1))

    # ── Confidence ───────────────────────────────────────────────────────────
    conf = round(
        c_demand.confidence     * 0.25
        + c_new_sell.confidence  * 0.20
        + c_listing.confidence   * 0.15
        + c_trend.confidence     * 0.15
        + c_saturation.confidence * 0.10
        + c_brand.confidence     * 0.10
        + c_integrity.confidence * 0.05,
        1,
    )

    # ── FBA economics ────────────────────────────────────────────────────────
    tier    = classify_size_tier(pkg.get("height_mm"), pkg.get("width_mm"),
                                  pkg.get("length_mm"), pkg.get("weight_g"))
    fba_fee = estimate_fee(tier, pkg.get("weight_g"), pkg.get("height_mm"),
                            pkg.get("width_mm"), pkg.get("length_mm"))
    margin  = net_margin_pct(price, fba_fee) if (price and fba_fee) else None

    cal_sales   = calibrated_monthly_sales(bsr.avg_bsr_90d, product.get("root_category"))
    monthly_rev = round(cal_sales * price, 2) if (cal_sales and price) else None

    wipe_count, wipe_detail = _review_integrity.detect_wipes(product)

    narrative = _generate_narrative(
        demand=c_demand,
        new_seller=c_new_sell,
        listing=c_listing,
        saturation=c_saturation,
        brand=c_brand,
        integrity=c_integrity,
        trend=c_trend,
        trend_breakdown=trend_breakdown,
        gap_score=gap_score,
        gap_bonus=gap_bonus,
        gap_narrative=gap_narrative,
        cal_sales=cal_sales,
        price=price,
        wipe_events=wipe_count,
    )

    return V4OpportunityScore(
        asin=bsr.asin,
        title=bsr.title,
        brand=product.get("brand"),
        category=str(product.get("root_category") or ""),
        demand=c_demand,
        new_seller=c_new_sell,
        listing_weakness=c_listing,
        market_saturation=c_saturation,
        brand_expansion=c_brand,
        review_integrity=c_integrity,
        trend_intelligence=c_trend,
        authenticity_score=trend_breakdown.authenticity_score,
        opportunity_gap_score=gap_score,
        opportunity_gap_bonus=gap_bonus,
        base_score=base,
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
        trend_breakdown=trend_breakdown,
        narrative=narrative,
        competition_level=_competition_label(c_saturation.score),
        risk_level=_risk_label(c_integrity.score, c_demand.score, bsr.trend_direction),
        recommendation=_recommend(final, c_integrity.score, c_demand.score, c_trend.score),
    )


# ── Narrative generation ──────────────────────────────────────────────────────

def _generate_narrative(
    demand, new_seller, listing, saturation, brand, integrity, trend,
    trend_breakdown, gap_score, gap_bonus, gap_narrative,
    cal_sales, price, wipe_events,
) -> ProductNarrative:

    why_growing   = _why_growing(demand, cal_sales, trend_breakdown)
    why_gap       = gap_narrative
    pl_label, pl_reason = _pl_suitability(new_seller.score, integrity.score, listing.score)
    brand_label, brand_reason = _brand_potential(brand.score, demand.score, trend.score)
    risks         = _top_risks(integrity, demand, trend_breakdown, saturation, wipe_events)
    action        = _recommended_action(pl_label, brand_label, integrity.score, trend_breakdown)

    return ProductNarrative(
        why_growing=why_growing,
        why_gap_exists=why_gap,
        pl_suitability_label=pl_label,
        pl_suitability_reason=pl_reason,
        brand_potential_label=brand_label,
        brand_potential_reason=brand_reason,
        top_risks=risks,
        recommended_action=action,
    )


def _why_growing(demand, cal_sales, breakdown: TrendBreakdown) -> str:
    parts = []
    if cal_sales and cal_sales >= 300:
        parts.append(f"~{cal_sales:,} units/mo estimated on Amazon")
    top_d = max(demand.factors, key=lambda f: f.points) if demand.factors else None
    if top_d and ("Improving" in top_d.rationale or "Accelerating" in top_d.rationale):
        parts.append("BSR improving — organic demand gaining momentum")
    elif top_d:
        parts.append(top_d.rationale[:80])

    amazon_signal = "; ".join(parts) if parts else "Amazon demand is stable"

    if breakdown.all_stubs:
        return (
            f"Amazon signal: {amazon_signal}. "
            "External trend sources not yet integrated — growth validated by Amazon data only."
        )
    # When live: add trend signal summary
    live_sources = [s for s in breakdown.sources if not s.is_stub and s.score is not None]
    trend_parts  = [f"{s.name} {s.score:.0f}/100" for s in live_sources]
    return (
        f"Amazon signal: {amazon_signal}. "
        f"External trends: {', '.join(trend_parts)} "
        f"(authenticity {breakdown.authenticity_score:.0f}/100)."
    )


def _pl_suitability(ns: float, ri: float, lw: float) -> tuple:
    if ri < 40:
        return "NOT SUITABLE", "Review manipulation detected in this market — do not enter"
    if ns > 70 and ri > 70 and lw > 55:
        return "EXCELLENT", f"New sellers winning (NS {ns:.0f}/100), clean review history (RI {ri:.0f}/100), differentiation opportunity (LW {lw:.0f}/100)"
    if ns > 55 and ri > 55:
        return "GOOD", f"Market accessible to new sellers (NS {ns:.0f}/100) with clean competitive dynamics (RI {ri:.0f}/100)"
    if ns > 35 and ri > 50:
        return "VIABLE", f"Entry possible but requires strong listing differentiation (NS {ns:.0f}/100)"
    if ri >= 40:
        return "DIFFICULT", f"New seller success rate is low (NS {ns:.0f}/100) — requires significant review velocity investment"
    return "NOT SUITABLE", "Market integrity concerns prevent confident private-label entry"


def _brand_potential(be: float, demand: float, trend: float) -> tuple:
    if be > 75 and demand > 60 and trend >= 50:
        return "FUTURE BRAND", f"High expansion potential ({be:.0f}/100) in a proven market — strong multi-SKU brand candidate"
    if be > 55 and demand > 50:
        return "BRAND CANDIDATE", f"Natural product line expansion possible (expansion score {be:.0f}/100)"
    if be > 35:
        return "SINGLE SKU", f"Limited brand extension signal ({be:.0f}/100) — treat as standalone product test first"
    return "COMMODITY RISK", f"Low expansion potential ({be:.0f}/100) — price competition risk, avoid unless unique angle exists"


def _top_risks(integrity, demand, breakdown: TrendBreakdown, saturation, wipe_events: int) -> list:
    risks = []
    if wipe_events > 0:
        risks.append(f"Review manipulation detected: {wipe_events} wipe event(s) in history")
    if breakdown.all_stubs:
        risks.append("External trend unvalidated — timing risk unknown without trend source integration")
    elif breakdown.authenticity_flags:
        risks.append(breakdown.authenticity_flags[0])
    if demand.score < 45:
        risks.append(f"Weak Amazon demand signal ({demand.score:.0f}/100) — market may be declining")
    if saturation.score < 40:
        risks.append(f"High Amazon competition ({saturation.score:.0f}/100 saturation) — entry window may be closing")
    return risks[:3]


def _recommended_action(pl_label: str, brand_label: str, ri: float, breakdown: TrendBreakdown) -> str:
    if pl_label == "NOT SUITABLE":
        return "Do not enter — manipulation signals or market integrity issues detected. Monitor for 90 days."
    if breakdown.all_stubs:
        if pl_label in ("EXCELLENT", "GOOD"):
            return "Validate with Google Trends and TikTok before ordering samples. If trend confirms, order 3 supplier samples immediately."
        return "Connect trend sources (Google Trends minimum) before committing. Amazon data alone is insufficient for timing this entry."
    if pl_label == "EXCELLENT" and brand_label in ("FUTURE BRAND", "BRAND CANDIDATE"):
        return "Order product samples from 3 suppliers this week. Prepare listing draft and brand identity before inventory lands."
    if pl_label in ("EXCELLENT", "GOOD"):
        return "Order supplier samples and validate MOQ. Budget for PPC from day 1 — review velocity is key."
    return "Monitor for 60 days. Set a Keepa BSR alert and revisit when trend source validation is available."


# ── Labels ────────────────────────────────────────────────────────────────────

def _recommend(final: float, ri: float, demand: float, trend: float) -> str:
    if ri < _RESEARCH_RI:
        return "REJECT"
    if (final >= _STRONG_FINAL and ri >= _STRONG_RI
            and demand >= _STRONG_DEMAND and trend >= _STRONG_TREND):
        return "STRONG OPPORTUNITY"
    if final >= _RESEARCH_FINAL:
        return "WORTH RESEARCH"
    return "REJECT"


def _competition_label(sat: float) -> str:
    if sat >= 65: return "Low"
    if sat >= 40: return "Medium"
    return "High"


def _risk_label(ri: float, demand: float, trend: str) -> str:
    if ri < 50 or trend == "Declining": return "High"
    if ri < 70 or demand < 45:          return "Medium"
    return "Low"


def _review_velocity(review_history: list, days: int = 90):
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
    return round(max(0, recent[-1][1] - recent[0][1]) / (days / 30.0), 1)
