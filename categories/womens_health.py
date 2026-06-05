"""
Women's Health Supplements — Hormone Support, Prenatal, Women's Multivitamins,
                              Fertility, Menopause, Cycle Support.

TikTok brand context: Ritual, Lemme, Needed, Beli Fertility, Perelel,
                      HUM Nutrition, Obvi.
Problem profile: hormonal balance, energy, cycle irregularity, skin/hair/nails.
Content potential: VERY HIGH — "what I take daily" routine videos, hormone health
                   education, before/after (hair, skin, energy level reporting).
Repeat purchase: VERY HIGH — daily supplement, monthly supply, subscription standard.

Subcategory IDs: using Vitamin C node (3774251) as a confirmed starting point.
Women's-specific Keepa nodes are estimated — validate before production run.
"""

from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="womens_health",
    display_name="Women's Health Supplements",
    parent_cat_id=6973753011,
    subcategories={
        # Confirmed from existing supplements.py config — broad multivitamin node
        "Vitamin C":                3774251,
        # Estimates — validate before production
        "Women's Multivitamins":    3774321,   # estimate
        "Prenatal Vitamins":        3774301,   # estimate
    },
    excluded_brands={
        # Established women's supplement brands
        "ritual", "one a day", "olly", "garden of life",
        "nature made", "nature's bounty", "natures bounty",
        "vitafusion", "rainbow light", "smarty pants",
        "prenatal", "thorne",
        # Pharmacy / mass-market
        "kirkland", "member's mark",
        "amazon", "solimo", "basics",
    },
    expansion_potential=90,
    repeat_purchase_potential=92,
    subscription_eligible=True,
    min_bsr=500,
    max_bsr=50_000,
    min_price=20.0,
    min_monthly_sales=150,
    # max_reviews intentionally omitted — review count is not a gate
)
