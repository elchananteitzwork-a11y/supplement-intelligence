"""
tests/test_price_fix.py

Proves the stats.current[1] (marketplace-new price) fallback works end-to-end.

Four assertions:
  1. Amazon-sold product — stats.current[0] populated, pipeline unchanged.
  2. 3P product — stats.current[0] = -1, stats.current[1] gives correct price.
  3. Revenue potential is calculated when 3P price is present.
  4. FBA margin is calculated when 3P price is present.

Run: python3 -m pytest tests/test_price_fix.py -v
  or: python3 tests/test_price_fix.py
"""

import sys
from pathlib import Path

# Allow direct execution as well as pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from keepa.normalizer import normalize_product
from keepa.scoring import score_product, _f_revenue_potential, _f_fba_margin
from keepa.models import (
    BSRAnalysis, ReviewVelocityAnalysis, PriceAnalysis, SellerTierEntry
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _raw(
    asin: str,
    current_0: int = -1,   # Amazon price (cents), -1 = no data
    current_1: int = -1,   # Marketplace-new price (cents), -1 = no data
    bsr: int = 3000,
    reviews: int = 50,
    weight_g: int = 200,
    height_mm: int = 50,
    width_mm: int = 100,
    length_mm: int = 150,
):
    """Minimal raw Keepa product dict — only the fields the normalizer reads."""
    sc = [-1] * 36
    sc[0]  = current_0
    sc[1]  = current_1
    sc[3]  = bsr
    sc[11] = 1           # offer count
    sc[16] = 45          # rating × 10 = 4.5★
    sc[17] = reviews
    sc[18] = -1          # buy box — always -1 without offers=N
    return {
        "asin":          asin,
        "title":         f"Test Product {asin}",
        "brand":         "TestBrand",
        "manufacturer":  "TestBrand",
        "rootCategory":  284507,
        "categoryTree":  [],
        "packageWeight": weight_g,
        "packageHeight": height_mm,
        "packageWidth":  width_mm,
        "packageLength": length_mm,
        "stats": {"current": sc},
        "csv":   [None] * 20,
    }


def _minimal_rv() -> ReviewVelocityAnalysis:
    return ReviewVelocityAnalysis(
        tier_under_100=[],
        tier_under_500=[],
        tier_under_1000=[],
        avg_reviews_page1=50.0,
        median_reviews_page1=50.0,
        min_reviews_page1=5,
        avg_monthly_velocity=2.0,
        fastest_grower_asin=None,
        fastest_grower_velocity=None,
        category_avg_r2r_efficiency=None,
        best_r2r_efficiency=None,
        best_r2r_asin=None,
        accessibility_verdict="Highly Accessible",
    )


def _minimal_pa(avg_price=None) -> PriceAnalysis:
    return PriceAnalysis(
        category_min_price=None,
        category_max_price=None,
        category_avg_price=avg_price,
        category_median_price=None,
        price_band_usd=None,
        price_compression=False,
        price_trend="Stable",
        avg_price_delta_90d=None,
        amazon_holds_buybox_pct=None,
        has_lightning_deal_activity=False,
        coupon_price_detected=False,
        product_summaries=[],
    )


def _minimal_bsr(asin, avg_bsr=3000) -> BSRAnalysis:
    return BSRAnalysis(
        asin=asin,
        title=f"Test {asin}",
        avg_bsr_90d=float(avg_bsr),
        avg_bsr_30d=float(avg_bsr),
        avg_bsr_365d=float(avg_bsr),
        trend_direction="Stable",
        trend_slope_per_day=0.0,
        bsr_volatility="Low",
        bsr_std_dev=50.0,
        estimated_monthly_sales=700,
        sales_estimate_confidence=60,
        demand_velocity="Stable",
        is_seasonal=False,
        seasonal_peak_month=None,
    )


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_amazon_sold_price_unchanged():
    """Amazon-sold: stats.current[0] populated → amazon_price correct, new_3p_price also set."""
    raw  = _raw("B000AMAZON", current_0=4999, current_1=4999)
    norm = normalize_product(raw)

    assert norm["current"]["amazon_price"] == 49.99, (
        f"amazon_price should be 49.99, got {norm['current']['amazon_price']}"
    )
    assert norm["current"]["new_3p_price"] == 49.99, (
        f"new_3p_price should also be 49.99 for Amazon-sold, got {norm['current']['new_3p_price']}"
    )
    assert norm["current"]["buybox_price"] is None, (
        "buybox_price should remain None (requires offers=N)"
    )
    print("PASS  test_amazon_sold_price_unchanged")


def test_3p_product_gets_price():
    """3P product: stats.current[0]=-1 → amazon_price=null; stats.current[1] → new_3p_price populated."""
    raw  = _raw("B0003PONLY", current_0=-1, current_1=3999)
    norm = normalize_product(raw)

    assert norm["current"]["amazon_price"] is None, (
        f"amazon_price should be None for 3P, got {norm['current']['amazon_price']}"
    )
    assert norm["current"]["new_3p_price"] == 39.99, (
        f"new_3p_price should be 39.99, got {norm['current']['new_3p_price']}"
    )
    print("PASS  test_3p_product_gets_price")


def test_revenue_potential_calculated_for_3p():
    """Revenue potential scores > 0 when 3P price is present (was always 0 before fix)."""
    raw  = _raw("B0003PREV", current_0=-1, current_1=3999, bsr=3000, reviews=50,
                weight_g=200, height_mm=50, width_mm=100, length_mm=150)
    norm = normalize_product(raw)

    # Manually verify price lookup works: scorer uses amazon_price OR new_3p_price
    price = norm["current"].get("amazon_price") or norm["current"].get("new_3p_price")
    assert price == 39.99, f"Scorer price lookup should yield 39.99, got {price}"

    # Revenue potential: calibrated_sales ≈ 700/mo × $39.99 ≈ $27,993/mo
    from keepa.sales_estimate import calibrated_monthly_sales
    cal = calibrated_monthly_sales(3000, 284507)
    pts, note = _f_revenue_potential(cal, price)

    assert pts > 0, (
        f"revenue_potential should be > 0 with price present, got {pts}. Note: {note}"
    )
    print(f"PASS  test_revenue_potential_calculated_for_3p  (score={pts}/8, note='{note}')")


def test_fba_margin_calculated_for_3p():
    """FBA margin scores > 0 when 3P price is present (was always 0 before fix)."""
    raw  = _raw("B0003PFBA", current_0=-1, current_1=2999,
                weight_g=300, height_mm=30, width_mm=120, length_mm=200)
    norm = normalize_product(raw)

    price = norm["current"].get("amazon_price") or norm["current"].get("new_3p_price")
    assert price == 29.99

    pkg  = norm.get("package", {})
    pts, note, fee, tier = _f_fba_margin(price, pkg)

    assert pts > 0, (
        f"fba_margin should be > 0 with price present, got {pts}. Note: {note}"
    )
    assert fee is not None, "FBA fee should be calculated"
    assert tier != "unknown", f"Size tier should be resolved, got '{tier}'"
    print(f"PASS  test_fba_margin_calculated_for_3p  "
          f"(score={pts}/15, fee=${fee:.2f}, tier={tier}, note='{note}')")


def test_no_price_still_scores_zero():
    """Control: product with no price at all still scores 0 on price-dependent factors."""
    raw  = _raw("B000NOPRICE", current_0=-1, current_1=-1)
    norm = normalize_product(raw)

    assert norm["current"]["amazon_price"]  is None
    assert norm["current"]["new_3p_price"]  is None
    assert norm["current"]["buybox_price"]  is None

    pts_rev, _ = _f_revenue_potential(700, None)
    pts_fba, _, fee, _ = _f_fba_margin(None, norm.get("package", {}))

    assert pts_rev == 0, f"revenue_potential should be 0 with no price, got {pts_rev}"
    assert pts_fba == 0, f"fba_margin should be 0 with no price, got {pts_fba}"
    assert fee is None
    print("PASS  test_no_price_still_scores_zero  (control)")


# ── Runner ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [
        test_amazon_sold_price_unchanged,
        test_3p_product_gets_price,
        test_revenue_potential_calculated_for_3p,
        test_fba_margin_calculated_for_3p,
        test_no_price_still_scores_zero,
    ]
    passed = failed = 0
    print(f"\n{'='*60}")
    print(f"  Price Fix Unit Tests")
    print(f"{'='*60}\n")
    for t in tests:
        try:
            t()
            passed += 1
        except AssertionError as e:
            print(f"FAIL  {t.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"ERROR {t.__name__}: {e}")
            failed += 1
    print(f"\n{'='*60}")
    print(f"  {passed} passed  |  {failed} failed")
    print(f"{'='*60}\n")
    if failed:
        sys.exit(1)
