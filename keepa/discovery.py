"""
Private-label opportunity filtering and brand exclusion.

Provides the criteria checks used by the opportunity-discovery agent
to narrow a broad product pool to realistic new-seller entry points.
"""

from typing import Any, Dict, List, Optional, Set

# ──────────────────────────────────────────────────────────────────
# Brand exclusion list
# Case-insensitive substring match against brand, manufacturer, title.
# ──────────────────────────────────────────────────────────────────

EXCLUDED_BRANDS: Set[str] = {
    # Explicitly listed by user
    "yeti", "ninja", "stanley", "hydrojug", "gorilla grip", "amazon basics",
    # Close variants / parent companies
    "sharkninja",       # owns Ninja
    "hydro flask",      # similar premium drinkware
    "nalgene",          # Hydro Flask's parent brand
    # Dominant Kitchen appliance brands
    "cuisinart", "kitchenaid", "instant pot", "instant brands", "breville",
    "hamilton beach", "keurig",
    # Dominant in specific niches (confirmed from live scan)
    "rubbermaid", "oxo", "lodge", "tramontina", "etekcity", "cosori",
    "homaxy", "hotor", "sok it", "gorilla",
    # Amazon private label
    "amazon", "solimo", "pinzon", "basics",
    # Other strong brand signals
    "cuisinart", "viking", "all-clad", "le creuset", "calphalon",
    "ninja foodi",
}

# ──────────────────────────────────────────────────────────────────
# Curated Kitchen subcategories for private-label discovery
# IDs confirmed from live Kitchen & Dining product data
# ──────────────────────────────────────────────────────────────────

KITCHEN_PL_SUBCATEGORIES: Dict[str, int] = {
    "Cutting Boards, Mats & Sets":             23944790011,
    "Ice Cube Molds & Trays":                    2469549011,
    "Dish Cloths & Dish Towels":                    3741991,
    "Measuring Tools & Scales":                      289785,
    "Kitchen Storage & Organization":               3744031,
    "Cooking Utensils":                            16439841,
    "Reusable Straws":                          21331300011,
    "Potholders & Oven Mitts":                      3742011,
}


def is_excluded(product: Dict[str, Any]) -> bool:
    """Return True if this product appears to be from a dominant/excluded brand."""
    brand        = (product.get("brand")        or "").lower()
    manufacturer = (product.get("manufacturer") or "").lower()
    title        = (product.get("title")        or "").lower()
    combined     = f"{brand} {manufacturer} {title}"
    return any(ex in combined for ex in EXCLUDED_BRANDS)


def meets_initial_criteria(
    product: Dict[str, Any],
    min_bsr:     int   = 500,
    max_bsr:     int   = 5000,
    max_reviews: int   = 200,
    min_price:   float = 20.0,
) -> bool:
    """
    Quick pre-analysis filter — rejects obvious non-starters without running
    the full analysis pipeline.
    """
    cur = product.get("current", {})
    bsr    = cur.get("bsr")
    rc     = cur.get("review_count")
    price  = cur.get("amazon_price") or cur.get("buybox_price")

    if bsr is None:
        return False
    if not (min_bsr <= bsr <= max_bsr):
        return False
    if rc is not None and rc >= max_reviews:
        return False
    if price is not None and price < min_price:
        return False
    return True


def apply_post_analysis_filter(
    products:      List[Dict[str, Any]],
    bsr_analyses:  List[Any],
    min_monthly_sales: int   = 300,
    allowed_trends: Set[str] = frozenset({"Improving", "Stable"}),
) -> List[Dict[str, Any]]:
    """
    Second-pass filter using BSR analysis results.
    Removes products with declining demand or insufficient estimated sales.
    """
    from keepa.sales_estimate import calibrated_monthly_sales

    bsr_map  = {b.asin: b for b in bsr_analyses}
    qualified = []

    for p in products:
        asin = p.get("asin")
        bsr  = bsr_map.get(asin)
        if not bsr:
            continue
        if bsr.trend_direction not in allowed_trends:
            continue
        root_cat = p.get("root_category")
        sales    = calibrated_monthly_sales(bsr.avg_bsr_90d, root_cat)
        if sales is not None and sales < min_monthly_sales:
            continue
        qualified.append(p)

    return qualified
