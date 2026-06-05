"""
V5 scoring engine orchestrator.

8-layer pipeline: Problem → Trend → Authenticity → Amazon → Integrity →
                  Repeat Purchase → Brandability → Amazon Gap

Entry point:
    from v5.engine import run
    scores = run(products, bsr_results, rv_result, price_result,
                 category_config, trend_sources, problem_sources)
"""

import statistics
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from keepa.fba import classify_size_tier, estimate_fee, net_margin_pct
from keepa.models import BSRAnalysis, PriceAnalysis, ReviewVelocityAnalysis
from keepa.sales_estimate import calibrated_monthly_sales

import v5.components.problem_discovery  as _problem
import v5.components.trend_velocity     as _trend_vel
import v5.components.trend_authenticity as _trend_auth
import v5.components.amazon_opportunity as _amz_opp
import v5.components.review_integrity   as _integrity
import v5.components.repeat_purchase    as _repeat
import v5.components.brandability       as _brand
import v5.components.amazon_gap         as _gap

from v4.sources import TrendDataSourceV4
from v4.sources.google_trends_stub  import GoogleTrendsStub
from v4.sources.tiktok_stub         import TikTokStub
from v4.sources.reddit_stub         import RedditStub
from v4.sources.pinterest_stub      import PinterestStub
from v4.sources.etsy_stub           import EtsyStub

from v5.components import MarketContext
from v5.components.brandability import lifestyle_tier
from v5.components.problem_discovery import problem_frame
from v5.models import BonusBreakdown, V5Narrative, V5OpportunityScore
from v5.sources import ProblemDataSource
from v5.sources.reddit_problem_stub   import RedditProblemStub
from v5.sources.quora_stub            import QuoraStub
from v5.sources.tiktok_comments_stub  import TikTokCommentsStub

if TYPE_CHECKING:
    from categories import CategoryConfig

_DEFAULT_TREND    = [GoogleTrendsStub(), TikTokStub(), RedditStub(), PinterestStub(), EtsyStub()]
_DEFAULT_PROBLEM  = [RedditProblemStub(), QuoraStub(), TikTokCommentsStub()]

# Recommendation thresholds
_ICONIC_FINAL      = 78.0
_ICONIC_RI         = 60.0
_ICONIC_PROBLEM    = 55.0
_ICONIC_BRAND      = 65.0
_STRONG_FINAL      = 70.0
_STRONG_RI         = 60.0
_STRONG_PROBLEM    = 45.0
_RESEARCH_FINAL    = 45.0
_RESEARCH_RI       = 40.0

# Bonus thresholds
_SUB_BONUS_RPP     = 65.0
_MULTI_SKU_BRAND   = 65.0
_MULTI_SKU_EXP     = 65.0
_EXT_TREND_MIN     = 55.0


def run(
    products:        List[Dict[str, Any]],
    bsr_results:     List[BSRAnalysis],
    rv_result:       ReviewVelocityAnalysis,
    price_result:    PriceAnalysis,
    category_config: Optional["CategoryConfig"] = None,
    trend_sources:   Optional[List[TrendDataSourceV4]] = None,
    problem_sources: Optional[List[ProblemDataSource]] = None,
) -> List[V5OpportunityScore]:
    if trend_sources is None:
        trend_sources = _DEFAULT_TREND
    if problem_sources is None:
        problem_sources = _DEFAULT_PROBLEM

    bsr_map = {b.asin: b for b in bsr_results}
    ctx = _build_context(products, bsr_results, rv_result, price_result,
                         category_config, trend_sources)

    scores = []
    for product in products:
        asin = product.get("asin")
        bsr  = bsr_map.get(asin)
        if not bsr:
            continue
        try:
            scores.append(_score_product(product, bsr, ctx, price_result,
                                         trend_sources, problem_sources))
        except Exception as exc:
            print(f"  WARNING: V5 scoring failed for {asin}: {exc}")

    scores.sort(key=lambda s: s.final_score, reverse=True)
    return scores


def _build_context(
    products, bsr_results, rv_result, price_result, cat_cfg, trend_sources,
) -> MarketContext:
    bsr_map = {b.asin: b for b in bsr_results}

    offer_counts = [
        p.get("current", {}).get("offer_count")
        for p in products if p.get("current", {}).get("offer_count") is not None
    ]
    avg_offer = round(statistics.mean(offer_counts), 1) if offer_counts else None

    brands = [(p.get("brand") or "").strip().lower() for p in products]
    unique_brands = len({b for b in brands if b})
    brand_ratio   = round(unique_brands / len(products), 3) if products else 0.0
    unknown_n     = sum(1 for b in brands if not b)
    unknown_pct   = round(unknown_n / len(products), 3) if products else 0.0

    low_review_winners = sum(
        1 for p in products
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
        for p in products if p.get("current", {}).get("rating") is not None
    ]
    avg_rating = round(statistics.mean(ratings), 2) if ratings else None

    seasonal_count = sum(1 for b in bsr_results if b.is_seasonal)
    seasonal_pct   = round(seasonal_count / len(bsr_results), 3) if bsr_results else 0.0

    cal_list = [calibrated_monthly_sales(b.avg_bsr_90d, None)
                for b in bsr_results if b.avg_bsr_90d is not None]
    cal_list = [s for s in cal_list if s]
    median_cal = int(statistics.median(cal_list)) if cal_list else None

    # ── Efficiency signals ────────────────────────────────────────────────────
    # category_s2r: total estimated monthly sales / total review count
    total_cal_sales  = sum(calibrated_monthly_sales(b.avg_bsr_90d, None) or 0
                           for b in bsr_results)
    total_reviews    = sum(p.get("current", {}).get("review_count") or 0
                           for p in products)
    category_s2r     = round(total_cal_sales / max(1, total_reviews), 2)

    # revenue_generating_pct: fraction of products generating > $3,000/mo
    avg_price_ctx    = price_result.category_avg_price or 30.0
    meaningful_n = sum(
        1 for b in bsr_results
        if (calibrated_monthly_sales(b.avg_bsr_90d, None) or 0) * avg_price_ctx >= 3_000
    )
    revenue_generating_pct = round(meaningful_n / max(1, len(bsr_results)), 3)

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
        expansion_potential=getattr(cat_cfg, "expansion_potential", 50) if cat_cfg else 50,
        category_avg_price=price_result.category_avg_price,
        trend_signals_available=any(s.is_available for s in trend_sources),
        repeat_purchase_potential=getattr(cat_cfg, "repeat_purchase_potential", 50) if cat_cfg else 50,
        subscription_eligible=getattr(cat_cfg, "subscription_eligible", False) if cat_cfg else False,
        category_name=getattr(cat_cfg, "name", "unknown") if cat_cfg else "unknown",
        category_s2r=category_s2r,
        revenue_generating_pct=revenue_generating_pct,
    )


def _score_product(
    product:         Dict[str, Any],
    bsr:             BSRAnalysis,
    ctx:             MarketContext,
    price_result:    PriceAnalysis,
    trend_sources:   List[TrendDataSourceV4],
    problem_sources: List[ProblemDataSource],
) -> V5OpportunityScore:
    current = product.get("current", {})
    pkg     = product.get("package", {}) or {}
    price   = current.get("price") or ctx.category_avg_price

    # ── 7 weighted components ────────────────────────────────────────────────
    c_problem  = _problem.score(product, bsr, ctx, problem_sources)
    c_trend_v, trend_breakdown = _trend_vel.score(product, bsr, ctx, trend_sources)

    live_signals = [
        sig for s in trend_sources if s.is_available
        for sig in [s.get_signal("", "")] if sig
    ]
    c_trend_a = _trend_auth.score(product, bsr, ctx, live_signals)

    c_amazon, _amz_detail = _amz_opp.score(product, bsr, ctx, price_result)
    c_integrity = _integrity.score(product, bsr, ctx)
    c_repeat    = _repeat.score(product, bsr, ctx)
    c_brand     = _brand.score(product, bsr, ctx)

    # ── Gap + bonuses ────────────────────────────────────────────────────────
    all_stubs = trend_breakdown.all_stubs
    gap_score, ext_bonus, gap_narrative = _gap.compute(
        trend_velocity=c_trend_v.score,
        amazon_opportunity=c_amazon.score,
        authenticity_score=c_trend_a.score,
        all_stubs=all_stubs,
    )

    sub_bonus = (
        10.0 if c_repeat.score >= _SUB_BONUS_RPP and ctx.subscription_eligible else 0.0
    )
    multi_bonus = (
        10.0 if c_brand.score >= _MULTI_SKU_BRAND and ctx.expansion_potential >= _MULTI_SKU_EXP
        else 0.0
    )

    bonuses = BonusBreakdown(
        external_acceleration=ext_bonus,
        subscription_model=sub_bonus,
        multi_sku_potential=multi_bonus,
        total=ext_bonus + sub_bonus + multi_bonus,
        external_reason=gap_narrative,
        subscription_reason=(
            f"Repeat purchase ≥ {_SUB_BONUS_RPP:.0f} and category subscription-eligible"
            if sub_bonus else "Subscription bonus not activated"
        ),
        multi_sku_reason=(
            f"Brandability {c_brand.score:.0f} ≥ {_MULTI_SKU_BRAND:.0f} "
            f"and expansion {ctx.expansion_potential} ≥ {_MULTI_SKU_EXP:.0f}"
            if multi_bonus else "Multi-SKU bonus not activated"
        ),
    )

    # ── Aggregate ────────────────────────────────────────────────────────────
    base = round(
        c_problem.score   * c_problem.weight
        + c_trend_v.score * c_trend_v.weight
        + c_trend_a.score * c_trend_a.weight
        + c_amazon.score  * c_amazon.weight
        + c_integrity.score * c_integrity.weight
        + c_repeat.score  * c_repeat.weight
        + c_brand.score   * c_brand.weight,
        1,
    )
    final = min(100.0, round(base + bonuses.total, 1))

    conf = round(
        c_problem.confidence   * 0.20
        + c_trend_v.confidence * 0.15
        + c_trend_a.confidence * 0.10
        + c_amazon.confidence  * 0.15
        + c_integrity.confidence * 0.10
        + c_repeat.confidence  * 0.15
        + c_brand.confidence   * 0.15,
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

    wipe_count, wipe_detail = _integrity.detect_wipes(product)

    narrative = _generate_narrative(
        product=product, bsr=bsr, ctx=ctx,
        problem=c_problem, trend_vel=c_trend_v, trend_auth=c_trend_a,
        amazon=c_amazon, integrity=c_integrity, repeat=c_repeat, brand=c_brand,
        bonuses=bonuses, gap_narrative=gap_narrative, wipe_events=wipe_count,
        all_stubs=all_stubs, cal_sales=cal_sales,
    )

    return V5OpportunityScore(
        asin=bsr.asin, title=bsr.title, brand=product.get("brand"),
        category=ctx.category_name,
        problem_score=c_problem,
        trend_velocity=c_trend_v,
        trend_authenticity=c_trend_a,
        amazon_opportunity=c_amazon,
        review_integrity=c_integrity,
        repeat_purchase=c_repeat,
        brandability=c_brand,
        bonuses=bonuses,
        amazon_gap_score=gap_score,
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
        narrative=narrative,
        competition_level=_competition(c_amazon.score),
        risk_level=_risk(c_integrity.score, c_problem.score, bsr.trend_direction),
        recommendation=_recommend(final, c_integrity.score, c_problem.score, c_brand.score),
    )


# ── Narrative generation ──────────────────────────────────────────────────────

def _generate_narrative(
    product, bsr, ctx, problem, trend_vel, trend_auth,
    amazon, integrity, repeat, brand, bonuses, gap_narrative,
    wipe_events, all_stubs, cal_sales,
) -> V5Narrative:

    why_want  = _why_people_want(problem, ctx, all_stubs)
    why_grow  = _why_growing(trend_vel, cal_sales, all_stubs)
    copy_diff, copy_reason = _copy_difficulty(brand.score, repeat.score, ctx.category_avg_price)
    brand_ass = _brand_assessment(brand, repeat, bonuses, ctx)
    tts       = _time_to_saturation(trend_vel.score, amazon.score, all_stubs)
    pl_label, pl_reason = _pl_suitability(amazon.score, integrity.score)
    brand_pot = _brand_potential(brand.score, repeat.score, problem.score, bonuses.total)
    risks     = _top_risks(integrity, problem, trend_vel, amazon, wipe_events, all_stubs)
    action    = _action(pl_label, brand_pot, integrity.score, all_stubs, bonuses)

    return V5Narrative(
        why_people_want_it=why_want,
        why_growing=why_grow,
        why_gap_exists=gap_narrative,
        copy_difficulty=copy_diff,
        copy_difficulty_reason=copy_reason,
        brand_assessment=brand_ass,
        time_to_saturation=tts,
        pl_suitability=pl_label,
        brand_potential=brand_pot,
        top_risks=risks,
        recommended_action=action,
    )


def _why_people_want(problem, ctx, all_stubs) -> str:
    frame = problem_frame(ctx)
    top_f = max(problem.factors, key=lambda f: f.points) if problem.factors else None
    signal = top_f.rationale[:80] if top_f else "demand signal available"
    if all_stubs:
        return (
            f"{frame}. Amazon signal: {signal}. "
            "Reddit/Quora/TikTok problem discovery not yet integrated."
        )
    return f"{frame}. Problem signal: {signal} (confidence {problem.confidence:.0f}%)."


def _why_growing(trend_vel, cal_sales, all_stubs) -> str:
    sales_note = f"~{cal_sales:,} units/mo on Amazon" if cal_sales else "Amazon sales data available"
    if all_stubs:
        return (
            f"{sales_note}. External trend data not integrated — "
            "growth timing cannot be confirmed without live trend sources."
        )
    top_f = max(trend_vel.factors, key=lambda f: f.points) if trend_vel.factors else None
    return f"{sales_note}. Trend signal: {top_f.rationale[:80] if top_f else 'trend data available'}."


def _copy_difficulty(brand_score, rpp, price) -> tuple:
    if brand_score >= 75 and rpp >= 70:
        return "Very High", "Brand identity + consumable pattern = durable moat (think AG1, Bloom)"
    if brand_score >= 60:
        return "High", "Brand identity creates meaningful switching costs — community lock-in"
    if rpp >= 65:
        return "Medium-High", "Repeat purchase creates customer retention — hard to poach subscribers"
    if price and price >= 25:
        return "Medium", "Higher price point requires quality + trust — not trivially copied"
    return "Low", "Commodity product — replicable by any supplier with minimal differentiation"


def _brand_assessment(brand, repeat, bonuses, ctx) -> str:
    tier = lifestyle_tier(max((f.points for f in brand.factors if f.name == "lifestyle_identity"),
                               default=0.0))
    lines = [
        f"Lifestyle tier: {tier}.",
        f"Brand score: {brand.score:.0f}/100 | Repeat purchase: {repeat.score:.0f}/100.",
    ]
    if bonuses.subscription_model:
        lines.append("Subscription model eligible (+10 bonus activated) — monthly recurring revenue path confirmed.")
    if bonuses.multi_sku_potential:
        lines.append("Multi-SKU expansion potential (+10 bonus activated) — natural product line exists.")
    if ctx.subscription_eligible:
        lines.append(f"Category ({ctx.category_name}) has validated subscription model precedent.")

    if brand.score >= 75:
        lines.append("ICONIC BRAND potential — movement-level identity with repeat purchase and content creation ceiling.")
    elif brand.score >= 55:
        lines.append("BRAND CANDIDATE — build identity first, expand SKUs by month 12.")
    else:
        lines.append("SINGLE SKU PLAY — validate product-market fit before investing in brand infrastructure.")
    return " ".join(lines)


def _time_to_saturation(trend_vel, amazon_opp, all_stubs) -> str:
    if all_stubs:
        if amazon_opp >= 65:
            return "12–24 months (open Amazon market — timing unconfirmed, needs trend validation)"
        if amazon_opp >= 45:
            return "6–18 months (estimated — connect trend sources to confirm)"
        return "Potentially < 6 months (Amazon competition already building)"
    if trend_vel >= 70 and amazon_opp <= 40:
        return "3–6 months (strong external trend + Amazon filling up fast)"
    if trend_vel >= 55 and amazon_opp <= 55:
        return "6–12 months"
    if trend_vel >= 40 and amazon_opp >= 50:
        return "12–24 months"
    return "24+ months (early-stage opportunity)"


def _pl_suitability(amazon_opp, ri) -> tuple:
    if ri < 40:
        return "NOT SUITABLE", "Manipulation gate — review integrity < 40"
    if amazon_opp >= 65 and ri >= 70:
        return "EXCELLENT", f"Open market (AO {amazon_opp:.0f}) with clean review history (RI {ri:.0f})"
    if amazon_opp >= 50 and ri >= 55:
        return "GOOD", f"Accessible market (AO {amazon_opp:.0f}) with acceptable integrity (RI {ri:.0f})"
    if amazon_opp >= 35 and ri >= 50:
        return "VIABLE", "Entry possible with strong listing differentiation"
    if ri >= 40:
        return "DIFFICULT", "Market is competitive — significant review velocity investment required"
    return "NOT SUITABLE", "Market integrity concerns prevent confident entry"


def _brand_potential(brand_score, rpp, problem_score, total_bonus) -> str:
    if brand_score >= 75 and rpp >= 65 and problem_score >= 55:
        return "ICONIC"
    if brand_score >= 60 and rpp >= 50:
        return "STRONG"
    if brand_score >= 45:
        return "CANDIDATE"
    if brand_score >= 30:
        return "SINGLE SKU"
    return "COMMODITY RISK"


def _top_risks(integrity, problem, trend_vel, amazon, wipe_events, all_stubs) -> list:
    risks = []
    if wipe_events:
        risks.append(f"Review manipulation: {wipe_events} wipe event(s) in history")
    if all_stubs:
        risks.append("External trend timing unvalidated — connect trend sources before committing capital")
    if problem.score < 45:
        risks.append("Weak problem signal — demand may be aspirational rather than urgent")
    if amazon.score < 40:
        risks.append(f"High Amazon competition (AO {amazon.score:.0f}/100) — entry window narrowing")
    if not all_stubs and trend_vel.score < 40:
        risks.append(f"Declining external trend ({trend_vel.score:.0f}/100) — may be past peak")
    return risks[:3]


def _action(pl_label, brand_pot, ri, all_stubs, bonuses) -> str:
    if pl_label == "NOT SUITABLE":
        return "Do not enter — manipulation or market integrity issue. Monitor 90 days."
    if brand_pot == "ICONIC" and pl_label in ("EXCELLENT", "GOOD"):
        return "Build brand foundation: name → packaging → content → community. Order 3 supplier samples this week."
    if all_stubs and pl_label in ("EXCELLENT", "GOOD"):
        return "Validate with Google Trends + TikTok first. If trend confirms, order samples and build brand assets."
    if bonuses.subscription_model:
        return "Design for subscription from day 1. Packaging must support recurring delivery. Pricer wins with community."
    if pl_label in ("EXCELLENT", "GOOD"):
        return "Order samples. Focus listing on lifestyle identity, not features. Invest in brand photography."
    return "Monitor. Set Keepa alert. Connect trend sources before investing."


# ── Labels ────────────────────────────────────────────────────────────────────

def _recommend(final, ri, problem, brand) -> str:
    if ri < _RESEARCH_RI:
        return "REJECT"
    if (final >= _ICONIC_FINAL and ri >= _ICONIC_RI
            and problem >= _ICONIC_PROBLEM and brand >= _ICONIC_BRAND):
        return "ICONIC BRAND POTENTIAL"
    if final >= _STRONG_FINAL and ri >= _STRONG_RI and problem >= _STRONG_PROBLEM:
        return "STRONG OPPORTUNITY"
    if final >= _RESEARCH_FINAL:
        return "WORTH RESEARCH"
    return "REJECT"


def _competition(amazon_opp) -> str:
    if amazon_opp >= 65: return "Low"
    if amazon_opp >= 40: return "Medium"
    return "High"


def _risk(ri, problem_score, trend) -> str:
    if ri < 50 or trend == "Declining": return "High"
    if ri < 70 or problem_score < 40:   return "Medium"
    return "Low"


def _review_velocity(history, days=90):
    from datetime import datetime, timezone, timedelta
    if len(history) < 2:
        return None
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    recent = []
    for e in history:
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
