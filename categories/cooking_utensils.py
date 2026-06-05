"""
Cooking Utensils — Kitchen Functional.

TikTok brand context: GIR (Get It Right), OXO (excluded), Dreamfarm, Joseph Joseph.
Problem profile: flimsy tools, melting spatulas, non-ergonomic handles.
Content potential: MODERATE — cooking demos, kitchen organization content.
Repeat purchase: LOW-MEDIUM — quality tools last years; gifting and set upgrades.
"""
from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="cooking_utensils",
    display_name="Cooking Utensils",
    parent_cat_id=284507,
    subcategories={"Cooking Utensils": 16439841},
    excluded_brands={
        "oxo", "rubbermaid", "cuisinart", "kitchenaid",
        "t-fal", "wilton", "amazon", "basics",
    },
    expansion_potential=50,
    repeat_purchase_potential=25,
    subscription_eligible=False,
    min_bsr=200,
    max_bsr=20_000,
    min_price=12.0,
    min_monthly_sales=100,
)
