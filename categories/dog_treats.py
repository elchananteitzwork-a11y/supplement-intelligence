"""
Dog Treats & Chews — Pet Consumables.

TikTok brand context: Zesty Paws, Bocce's Bakery, Cloud Star, Stewart.
Problem profile: training reinforcement, dental health, boredom/anxiety.
Content potential: HIGH — dog training videos, taste-test reactions, dental before/after.
Repeat purchase: VERY HIGH — treats consumed weekly; subscription standard (BarkBox model).
"""
from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="dog_treats",
    display_name="Dog Treats & Chews",
    parent_cat_id=2619533,
    subcategories={"Dog Treats": 2975322011},
    excluded_brands={
        "purina", "blue buffalo", "zesty paws", "milk-bone",
        "greenies", "pedigree", "nutro", "rachael ray",
        "frisco", "reddy", "amazon", "basics",
    },
    expansion_potential=80,
    repeat_purchase_potential=92,
    subscription_eligible=True,
    min_bsr=100,
    max_bsr=15_000,
    min_price=15.0,
    min_monthly_sales=150,
)
