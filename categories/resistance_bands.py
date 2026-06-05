"""
Resistance Bands — Home Fitness.

TikTok brand context: Lululemon, Recoop, Perform Better, Whatafit.
Problem profile: gym inaccessibility, travel workout, rehab/mobility.
Content potential: HIGH — workout demos, resistance comparisons, travel fitness content.
Repeat purchase: MEDIUM — bands snap/wear; sets purchased as upgrades.
"""
from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="resistance_bands",
    display_name="Resistance Bands",
    parent_cat_id=3375251,
    subcategories={"Resistance Bands": 3413771},
    excluded_brands={
        "theraband", "bodylastics", "amazon", "basics",
    },
    expansion_potential=60,
    repeat_purchase_potential=35,
    subscription_eligible=False,
    min_bsr=100,
    max_bsr=10_000,
    min_price=15.0,
    min_monthly_sales=150,
)
