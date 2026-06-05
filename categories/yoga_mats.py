"""
Yoga Mats — Wellness & Fitness.

TikTok brand context: Lululemon (Lift), Manduka, Gaiam, IUGA, Retrospec.
Problem profile: slipping during practice, poor cushioning, carrying inconvenience.
Content potential: HIGH — yoga routine demos, mat texture/grip comparisons.
Repeat purchase: MEDIUM — mats last 1-3 years; accessories (straps, blocks) repeat faster.
"""
from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="yoga_mats",
    display_name="Yoga Mats",
    parent_cat_id=3375251,
    subcategories={"Yoga Mats": 3413761},
    excluded_brands={
        "lululemon", "manduka", "gaiam", "jade yoga",
        "amazon", "basics",
    },
    expansion_potential=65,
    repeat_purchase_potential=30,
    subscription_eligible=False,
    min_bsr=100,
    max_bsr=10_000,
    min_price=20.0,
    min_monthly_sales=100,
)
