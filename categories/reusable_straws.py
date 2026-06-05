"""
Reusable Straws — Eco / Sustainable Living.

TikTok brand context: Hydro Flask (drinkware), FinalStraw, MFCO, W&P.
Problem profile: environmental guilt, single-use plastic, staining sippy cups.
Content potential: MODERATE — eco-lifestyle content, zero-waste routine.
Repeat purchase: MEDIUM — sets lost/damaged over time; gifting occasions.
"""
from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="reusable_straws",
    display_name="Reusable Straws",
    parent_cat_id=284507,
    subcategories={"Reusable Straws": 21331300011},
    excluded_brands={
        "hydro flask", "yeti", "stanley", "amazon", "basics",
    },
    expansion_potential=45,
    repeat_purchase_potential=30,
    subscription_eligible=False,
    min_bsr=200,
    max_bsr=15_000,
    min_price=8.0,
    min_monthly_sales=100,
)
