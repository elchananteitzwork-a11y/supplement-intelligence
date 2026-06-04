"""
Product opportunity scoring engine — Phase 2 (v2).

12 factors, weights sum to 100.
Plus a data-confidence penalty (up to −15) applied after the raw total.

Changes from v1:
  - profit_margin_proxy (6 pts) replaced by fba_margin (15 pts)
    using real FBA fee estimation from keepa.fba
  - BSR→sales uses category velocity calibration (keepa.sales_estimate)
  - review_barrier: 0 reviews no longer scores 8/8 (unvalidated floor)
  - review_velocity_threat: capped at 4/7 when review history is sparse
  - price_stability: cross-penalised when rising prices + declining demand
  - buybox_opportunity: None defaults to neutral 4/8 (was optimistic 6/8)
  - seasonality: known peak month scores 3/5 instead of flat 2/5
  - data_confidence_penalty: up to −15 for thin BSR/review history

Weight rebalance (all changes from v1):
  demand_level              15 → 13   (calibrated sales more reliable, slightly de-weighted)
  demand_trend              10 →  9
  revenue_potential         10 →  8   (demand_level + fba_margin already capture this signal)
  competition_accessibility 10 → 10   (unchanged)
  review_barrier             8 →  9   (+1, more important after 0-review fix)
  review_velocity_threat     7 →  6
  price_stability            8 →  6
  price_compression_risk     8 →  7
  buybox_opportunity         8 →  7
  promotional_pressure       5 →  5   (unchanged)
  seasonality_risk           5 →  5   (unchanged)
  profit_margin_proxy        6 → [removed]
  fba_margin                 — → 15   [new]
  ─────────────────────────────────────────
  TOTAL                    100   100
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from keepa.fba import score_margin, net_margin_pct, classify_size_tier, estimate_fee
from keepa.models import BSRAnalysis, FactorScore, PriceAnalysis, ProductScore, ReviewVelocityAnalysis
from keepa.reviews import _review_velocity
from keepa.sales_estimate import calibrated_monthly_sales, CATEGORY_VELOCITY_FACTORS, DEFAULT_VELOCITY_FACTOR


# ──────────────────────────────────────────────────────────────────
# Weights (must sum to 100)
# ──────────────────────────────────────────────────────────────────

WEIGHTS: Dict[str, int] = {
    "demand_level":              13,
    "demand_trend":               9,
    "revenue_potential":          8,
    "competition_accessibility": 10,
    "review_barrier":             9,
    "review_velocity_threat":     6,
    "price_stability":            6,
    "price_compression_risk":     7,
    "buybox_opportunity":         7,
    "promotional_pressure":       5,
    "seasonality_risk":           5,
    "fba_margin":                15,
}

assert sum(WEIGHTS.values()) == 100, f"Weights sum to {sum(WEIGHTS.values())}, expected 100"

# Maximum data-quality penalty (points deducted after raw total)
MAX_DATA_PENALTY = 20


# ──────────────────────────────────────────────────────────────────
# Factor scorers
# ──────────────────────────────────────────────────────────────────

def _f_demand_level(
    calibrated_sales: Optional[int],
    confidence: int,
) -> Tuple[float, str]:
    if not calibrated_sales:
        return 0, "No sales estimate — BSR data missing"
    note = f"{calibrated_sales:,} units/mo (calibrated)"
    if calibrated_sales >= 1000: pts = 13
    elif calibrated_sales >= 500:  pts = 10
    elif calibrated_sales >= 200:  pts = 7
    elif calibrated_sales >= 100:  pts = 4
    elif calibrated_sales >= 50:   pts = 2
    else:                          pts = 0
    # Reduce if sales estimate confidence is very low
    if confidence < 40:
        pts = max(0, pts - 2)
        note += " [low-confidence estimate]"
    return pts, note


def _f_demand_trend(trend: str, velocity: str, bsr_pts: int) -> Tuple[float, str]:
    table = {
        ("Improving",  "Accelerating"):  (9,  "Demand rising and accelerating"),
        ("Improving",  "Stable"):         (7,  "Demand improving, velocity stable"),
        ("Improving",  "Decelerating"):   (5,  "Demand improving but slowing"),
        ("Improving",  "Unknown"):        (5,  "Demand improving"),
        ("Stable",     "Accelerating"):   (6,  "Stable demand, acceleration signal"),
        ("Stable",     "Stable"):         (4,  "Stable demand"),
        ("Stable",     "Decelerating"):   (2,  "Stable demand but decelerating"),
        ("Stable",     "Unknown"):        (3,  "Stable demand"),
        ("Declining",  "Accelerating"):   (2,  "Declining demand — brief acceleration signal"),
        ("Declining",  "Stable"):         (1,  "Declining demand"),
        ("Declining",  "Decelerating"):   (0,  "Declining and decelerating — avoid"),
        ("Declining",  "Unknown"):        (1,  "Declining demand"),
    }
    pts, note = table.get((trend, velocity), (2, f"Trend: {trend} / Velocity: {velocity}"))
    if bsr_pts < 10:
        pts = max(0, pts - 2)
        note += f" [thin BSR history: {bsr_pts} pts]"
    return pts, note


def _f_revenue_potential(
    calibrated_sales: Optional[int],
    price: Optional[float],
) -> Tuple[float, str]:
    if not calibrated_sales or not price:
        return 0, "Insufficient data for revenue estimate"
    rev = calibrated_sales * price
    if rev >= 20_000: return 8, f"${rev:,.0f}/mo — excellent"
    if rev >= 10_000: return 6, f"${rev:,.0f}/mo — strong"
    if rev >= 5_000:  return 5, f"${rev:,.0f}/mo — good"
    if rev >= 2_500:  return 3, f"${rev:,.0f}/mo — moderate"
    if rev >= 1_000:  return 2, f"${rev:,.0f}/mo — low"
    return 0, f"${rev:,.0f}/mo — insufficient"


def _f_competition_accessibility(verdict: str) -> Tuple[float, str]:
    return {
        "Highly Accessible": (10, "3+ sellers < 100 reviews making real sales"),
        "Accessible":         (7, "Multiple sellers < 500 reviews competing"),
        "Hard to Enter":      (3, "Few sellers below 1,000 reviews"),
        "Locked":             (0, "Market dominated by established sellers"),
    }.get(verdict, (3, f"Accessibility: {verdict}"))


def _f_review_barrier(review_count: Optional[int]) -> Tuple[float, str]:
    if review_count is None:
        return 4, "No review data"
    # FIX: 0 reviews = unvalidated product — cap at 3/9
    if review_count == 0:
        return 3, "No reviews — product unvalidated (high risk)"
    if review_count < 10:
        return 6, f"{review_count} reviews — very early stage"
    if review_count < 50:
        return 9, f"{review_count} reviews — very low barrier ✓"
    if review_count < 100:
        return 7, f"{review_count} reviews — low barrier"
    if review_count < 250:
        return 4, f"{review_count} reviews — moderate barrier"
    if review_count < 500:
        return 2, f"{review_count} reviews — high barrier"
    return 0, f"{review_count:,} reviews — very high barrier"


def _f_review_velocity_threat(velocity: Optional[float], rev_hist_len: int) -> Tuple[float, str]:
    # FIX: cap score at 4/6 when review history is sparse
    sparse = rev_hist_len < 5
    cap    = 4 if sparse else 6
    suffix = f" [sparse history: {rev_hist_len} pts]" if sparse else ""

    if velocity is None:
        return min(3, cap), f"No velocity data{suffix}"
    if velocity < 5:   return min(6, cap), f"{velocity}/mo — slow market{suffix}"
    if velocity < 15:  return min(4, cap), f"{velocity}/mo — moderate velocity{suffix}"
    if velocity < 30:  return min(2, cap), f"{velocity}/mo — fast velocity{suffix}"
    return min(1, cap), f"{velocity}/mo — very fast{suffix}"


def _f_price_stability(trend: str, bsr_trend: str) -> Tuple[float, str]:
    # FIX: cross-check rising prices against demand direction
    if trend == "Rising" and bsr_trend == "Declining":
        return 2, "Prices rising but demand declining — likely seller exit, not growth"
    return {
        "Rising":            (6, "Prices rising — market has pricing power"),
        "Stable":            (5, "Prices stable — predictable margins"),
        "Declining":         (1, "Prices declining — margin erosion risk"),
        "Insufficient data": (2, "Insufficient price history"),
    }.get(trend, (2, f"Price trend: {trend}"))


def _f_price_compression(compressed: bool, band: Optional[float]) -> Tuple[float, str]:
    if band is None:
        return 3, "No price band data"
    if compressed:
        return 0, f"${band:.2f} band — race-to-the-bottom compression"
    if band < 5:
        return 2, f"${band:.2f} band — tight pricing"
    if band < 10:
        return 5, f"${band:.2f} band — moderate spread"
    return 7, f"${band:.2f} band — healthy price spread"


def _f_buybox_opportunity(amazon_bb_pct: Optional[float]) -> Tuple[float, str]:
    # FIX: None → neutral 4/7 (was optimistic 6/8)
    if amazon_bb_pct is None:
        return 4, "Buy Box data unavailable — neutral assumption"
    if amazon_bb_pct < 20:  return 7, f"Amazon BB {amazon_bb_pct}% — strong 3P opportunity"
    if amazon_bb_pct < 40:  return 5, f"Amazon BB {amazon_bb_pct}% — moderate 3P opportunity"
    if amazon_bb_pct < 60:  return 3, f"Amazon BB {amazon_bb_pct}% — partial Amazon dominance"
    if amazon_bb_pct < 80:  return 1, f"Amazon BB {amazon_bb_pct}% — Amazon dominant"
    return 0, f"Amazon BB {amazon_bb_pct}% — Amazon locked"


def _f_promotional_pressure(lightning_deal: bool, coupon: bool) -> Tuple[float, str]:
    if not lightning_deal and not coupon:
        return 5, "No promotional activity — organic pricing"
    if lightning_deal and coupon:
        return 0, "Heavy promotional pressure (deals + coupons)"
    label = "Lightning Deal activity" if lightning_deal else "Coupon pricing"
    return 2, f"Some promotional pressure — {label} detected"


def _f_seasonality(is_seasonal: bool, peak_month: Optional[str]) -> Tuple[float, str]:
    if not is_seasonal:
        return 5, "Year-round demand — lower timing risk"
    # FIX: known peak month = predictable, score 3/5 instead of flat 2/5
    if peak_month and "Detected" not in peak_month:
        return 3, f"Seasonal — peak: {peak_month} (predictable timing)"
    return 2, "Seasonal — peak timing unknown (planning risk)"


def _f_fba_margin(
    price: Optional[float],
    pkg: Dict[str, Any],
) -> Tuple[float, str, Optional[float], str]:
    """Returns (score, rationale, fba_fee, size_tier)."""
    h = pkg.get("height_mm")
    w = pkg.get("width_mm")
    l = pkg.get("length_mm")
    g = pkg.get("weight_g")
    pts, note, fee, tier = score_margin(price, h, w, l, g, weight=WEIGHTS["fba_margin"])
    return round(pts), note, fee, tier


# ──────────────────────────────────────────────────────────────────
# Data confidence penalty
# ──────────────────────────────────────────────────────────────────

def _data_penalty(bsr: BSRAnalysis, product: Dict[str, Any]) -> Tuple[float, str]:
    """
    Compute penalty points for thin or missing historical data.
    Maximum penalty: MAX_DATA_PENALTY points.
    """
    bsr_hist     = product.get("history", {}).get("bsr", [])
    rev_hist     = product.get("history", {}).get("review_count", [])
    review_count = product.get("current", {}).get("review_count")
    penalty      = 0
    notes        = []

    # Zero reviews = no buyer validation — biggest single data risk
    if review_count == 0:
        penalty += 10
        notes.append("0 reviews — no buyer validation")
    elif review_count is not None and review_count < 5:
        penalty += 4
        notes.append(f"only {review_count} reviews — very early stage")

    # BSR history depth
    if len(bsr_hist) < 5:
        penalty += 8
        notes.append(f"very thin BSR history ({len(bsr_hist)} pts)")
    elif len(bsr_hist) < 15:
        penalty += 4
        notes.append(f"thin BSR history ({len(bsr_hist)} pts)")

    # Review history depth
    if len(rev_hist) < 3:
        penalty += 5
        notes.append(f"no review history ({len(rev_hist)} pts)")

    # Low sales-estimate confidence
    if bsr.sales_estimate_confidence < 40:
        penalty += 2
        notes.append(f"low BSR confidence ({bsr.sales_estimate_confidence}%)")

    total  = min(MAX_DATA_PENALTY, penalty)
    reason = ", ".join(notes) if notes else "data quality OK"
    return total, reason


# ──────────────────────────────────────────────────────────────────
# Grade
# ──────────────────────────────────────────────────────────────────

def _grade(score: float) -> Tuple[str, str]:
    if score >= 80: return "A", "Excellent Opportunity"
    if score >= 65: return "B", "Good Opportunity"
    if score >= 50: return "C", "Average Opportunity"
    if score >= 35: return "D", "Below Average"
    return "F", "Poor Opportunity"


# ──────────────────────────────────────────────────────────────────
# Per-product scorer
# ──────────────────────────────────────────────────────────────────

def score_product(
    bsr: BSRAnalysis,
    product: Dict[str, Any],
    rv: ReviewVelocityAnalysis,
    pa: PriceAnalysis,
) -> ProductScore:
    current      = product.get("current", {})
    pkg          = product.get("package", {}) or {}
    price        = current.get("price") or pa.category_avg_price
    review_count = current.get("review_count")
    review_hist  = product.get("history", {}).get("review_count", [])
    bsr_hist     = product.get("history", {}).get("bsr", [])
    root_cat     = product.get("root_category")

    velocity    = _review_velocity(review_hist)
    cal_sales   = calibrated_monthly_sales(bsr.avg_bsr_90d, root_cat)
    monthly_rev = round(cal_sales * price, 2) if cal_sales and price else None

    # FBA margin factor
    fba_pts, fba_note, fba_fee, size_tier = _f_fba_margin(price, pkg)

    # Net margin pct for display
    net_margin = net_margin_pct(price, fba_fee) if (price and fba_fee) else None

    raw_factors = [
        ("demand_level",              WEIGHTS["demand_level"],
         *_f_demand_level(cal_sales, bsr.sales_estimate_confidence)),
        ("demand_trend",              WEIGHTS["demand_trend"],
         *_f_demand_trend(bsr.trend_direction, bsr.demand_velocity, len(bsr_hist))),
        ("revenue_potential",         WEIGHTS["revenue_potential"],
         *_f_revenue_potential(cal_sales, price)),
        ("competition_accessibility", WEIGHTS["competition_accessibility"],
         *_f_competition_accessibility(rv.accessibility_verdict)),
        ("review_barrier",            WEIGHTS["review_barrier"],
         *_f_review_barrier(review_count)),
        ("review_velocity_threat",    WEIGHTS["review_velocity_threat"],
         *_f_review_velocity_threat(velocity, len(review_hist))),
        ("price_stability",           WEIGHTS["price_stability"],
         *_f_price_stability(pa.price_trend, bsr.trend_direction)),
        ("price_compression_risk",    WEIGHTS["price_compression_risk"],
         *_f_price_compression(pa.price_compression, pa.price_band_usd)),
        ("buybox_opportunity",        WEIGHTS["buybox_opportunity"],
         *_f_buybox_opportunity(pa.amazon_holds_buybox_pct)),
        ("promotional_pressure",      WEIGHTS["promotional_pressure"],
         *_f_promotional_pressure(pa.has_lightning_deal_activity, pa.coupon_price_detected)),
        ("seasonality_risk",          WEIGHTS["seasonality_risk"],
         *_f_seasonality(bsr.is_seasonal, bsr.seasonal_peak_month)),
        ("fba_margin",                WEIGHTS["fba_margin"],
         fba_pts, fba_note),
    ]

    factors  = [FactorScore(name=n, weight=w, score=s, rationale=r) for n, w, s, r in raw_factors]
    raw      = round(sum(f.score for f in factors), 1)
    penalty, _ = _data_penalty(bsr, product)
    total    = max(0.0, round(raw - penalty, 1))
    grade, verdict = _grade(total)

    return ProductScore(
        asin=bsr.asin,
        title=bsr.title,
        total_score=total,
        raw_score=raw,
        data_penalty=penalty,
        grade=grade,
        verdict=verdict,
        factors=factors,
        estimated_monthly_sales=bsr.estimated_monthly_sales,
        calibrated_monthly_sales=cal_sales,
        estimated_monthly_revenue=monthly_rev,
        fba_size_tier=size_tier,
        estimated_fba_fee=fba_fee,
        estimated_net_margin_pct=net_margin,
    )


# ──────────────────────────────────────────────────────────────────
# Batch runner
# ──────────────────────────────────────────────────────────────────

def run(
    bsr_results: List[BSRAnalysis],
    normalized_products: List[Dict[str, Any]],
    rv_analysis: ReviewVelocityAnalysis,
    price_analysis: PriceAnalysis,
) -> List[ProductScore]:
    """Score all products, sorted by total_score descending."""
    product_map = {p.get("asin"): p for p in normalized_products}
    scores = []
    for bsr in bsr_results:
        product = product_map.get(bsr.asin)
        if not product:
            continue
        try:
            scores.append(score_product(bsr, product, rv_analysis, price_analysis))
        except Exception as exc:
            print(f"  WARNING: Scoring failed for {bsr.asin}: {exc}")
    scores.sort(key=lambda s: s.total_score, reverse=True)
    return scores
