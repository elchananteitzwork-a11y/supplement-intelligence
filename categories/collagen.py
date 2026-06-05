"""
Collagen Supplements — Peptides, Powders, Capsules, Gummies.

TikTok brand context: Vital Proteins, Ancient Nutrition, Bloom Collagen,
                      Sports Research, Great Lakes Wellness.
Problem profile: skin elasticity, hair thickness, nail strength, joint support.
Content potential: VERY HIGH — before/after skin photos, hair growth timelines,
                   collagen in coffee/smoothie recipe videos.
Repeat purchase: VERY HIGH — daily powder, 30-day supply cycle, subscription standard.

Subcategory ID confirmed: 26879861011 (from existing supplements.py config).
"""

from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="collagen",
    display_name="Collagen Supplements",
    parent_cat_id=6973753011,
    subcategories={
        # Confirmed from existing supplements.py config
        "Collagen":                26879861011,
        # Protein Supplements node also contains collagen peptide powders
        "Protein Supplements":      3774481,
    },
    excluded_brands={
        # Category leaders already at scale
        "vital proteins", "ancient nutrition", "sports research",
        "great lakes", "great lakes wellness",
        "neocell", "further food",
        # Mass-market / pharmacy
        "nature's bounty", "natures bounty", "nature made",
        "now foods", "doctor's best", "jarrow",
        "kirkland", "member's mark",
        "amazon", "solimo", "basics",
    },
    expansion_potential=88,
    repeat_purchase_potential=93,
    subscription_eligible=True,
    min_bsr=500,
    max_bsr=50_000,
    min_price=20.0,
    min_monthly_sales=150,
    # max_reviews intentionally omitted — review count is not a gate
)
