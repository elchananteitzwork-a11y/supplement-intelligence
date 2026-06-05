"""
Gut Health — Probiotics, Digestive Enzymes, Fiber & Prebiotics.

TikTok brand context: Bloom Nutrition, Seed, Garden of Life.
Problem profile: bloating, digestive discomfort, irregular digestion.
Content potential: VERY HIGH — stomach before/after, gut routine videos.
Repeat purchase: VERY HIGH — daily consumable, subscription model validated.

Subcategory IDs: validate against live Keepa data before production run.
Using parent category (6973753011) as fallback for the validation scan.
BSR range widened (500–50,000): Seed and comparable brands operate across
a wide BSR range depending on their Amazon presence. review-count gating removed.
"""

from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="gut_health",
    display_name="Gut Health — Probiotics & Digestive",
    parent_cat_id=6973753011,
    subcategories={
        # Best-estimate Keepa IDs — validate before production
        "Probiotics":              3774411,   # estimate; confirm via Keepa browse
        "Digestive Supplements":   3774421,   # estimate
        "Fiber Supplements":       3774431,   # estimate
    },
    excluded_brands={
        # Mass-market / pharmacy incumbents
        "culturelle", "align", "florastor", "digestive advantage",
        "benefiber", "metamucil", "miralax", "phillips",
        # Retail private labels
        "kirkland", "member's mark",
        # Amazon private label
        "amazon", "solimo", "basics",
        # Established supplement giants
        "garden of life", "now foods", "jarrow", "solgar",
        "nature's bounty", "natures bounty", "nature made",
    },
    expansion_potential=92,
    repeat_purchase_potential=95,
    subscription_eligible=True,
    min_bsr=500,
    max_bsr=50_000,
    min_price=20.0,
    min_monthly_sales=150,
    # max_reviews intentionally omitted — review count is not a gate
)
