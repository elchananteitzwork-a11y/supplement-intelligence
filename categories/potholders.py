"""
Potholders & Oven Mitts — Kitchen Functional / Safety.

TikTok brand context: Homwe, Grill Armor, Ove Glove.
Problem profile: burns from inadequate protection, worn-out fabric mitts.
Content potential: LOW-MODERATE — kitchen safety, aesthetic kitchen aesthetics.
Repeat purchase: LOW — functional product, replaced only when worn out.
"""
from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="potholders",
    display_name="Potholders & Oven Mitts",
    parent_cat_id=284507,
    subcategories={"Potholders & Oven Mitts": 3742011},
    excluded_brands={
        "ove glove", "cuisinart", "kitchenaid", "oxo",
        "amazon", "basics",
    },
    expansion_potential=35,
    repeat_purchase_potential=20,
    subscription_eligible=False,
    min_bsr=200,
    max_bsr=20_000,
    min_price=10.0,
    min_monthly_sales=100,
)
