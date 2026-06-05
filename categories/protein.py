"""
Protein Supplements — Whey, Plant-Based, Casein, Blends.

TikTok brand context: Bloom Nutrition Protein, Ghost Protein, Ryze (functional),
                      Obvi Collagen Protein, Truvani, Ladder.
Problem profile: muscle recovery, daily protein targets, clean eating.
Content potential: HIGH — recipe integration (protein pancakes, shakes),
                   post-workout routine, flavour/texture reaction videos.
Repeat purchase: VERY HIGH — 30-day supply, subscription validated, flavour rotation.

Note: Protein Supplements node (3774481) confirmed from existing supplements.py.
      Sports Nutrition (3774591) included as many DTC protein brands live there.
      Amino Acids (3774461) excluded — too niche for brand-first strategy.
"""

from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="protein",
    display_name="Protein Supplements",
    parent_cat_id=6973753011,
    subcategories={
        # Confirmed from existing supplements.py config
        "Protein Supplements":  3774481,
        "Sports Nutrition":     3774591,
    },
    excluded_brands={
        # Established category giants
        "optimum nutrition", "bsn", "muscletech", "cellucor", "c4",
        "gnc", "isopure", "dymatize", "myprotein",
        # Mass-market
        "nature's best", "pure protein", "premier protein",
        "kirkland", "member's mark",
        "amazon", "solimo", "basics",
    },
    expansion_potential=85,
    repeat_purchase_potential=90,
    subscription_eligible=True,
    min_bsr=500,
    max_bsr=50_000,
    min_price=25.0,
    min_monthly_sales=150,
    # max_reviews intentionally omitted — review count is not a gate
)
