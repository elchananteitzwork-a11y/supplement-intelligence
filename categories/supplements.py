"""
Vitamins & Dietary Supplements — category configuration.

REGULATORY WARNING: Supplements require FDA facility registration.
Amazon gates new sellers in this category.  Confirm selling eligibility
before sourcing inventory.

NOTE: Subcategory IDs below are estimates and must be validated against
live Keepa data before running a scan.  BSR range set to 2,000–15,000
as a starting estimate; calibrate after first live scan.
"""

from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="supplements",
    display_name="Vitamins & Dietary Supplements",
    parent_cat_id=6973753011,
    subcategories={
        # NOTE: validate IDs before first live scan
        "Amino Acids":          3774461,
        "Protein Supplements":  3774481,
        "Sports Nutrition":     3774591,
        "Collagen":           26879861011,
        "Vitamin C":            3774251,
        "Magnesium":          26879851011,
    },
    excluded_brands={
        # Established supplement brands
        "garden of life", "nature made", "vitafusion", "goli",
        "optimum nutrition", "bsn", "muscletech", "cellucor",
        "gnc", "now foods", "solgar", "nature's bounty",
        "natures bounty", "naturewise", "jarrow",
        "nordic naturals", "thorne", "pure encapsulations",
        # Retail private labels
        "kirkland", "member's mark",
        # Amazon private label
        "amazon", "solimo", "basics",
    },
    expansion_potential=90,
    repeat_purchase_potential=95,
    subscription_eligible=True,
    min_bsr=500,
    max_bsr=50_000,
    min_price=20.0,
    min_monthly_sales=150,
    # max_reviews intentionally omitted — review count is no longer a gate
)
