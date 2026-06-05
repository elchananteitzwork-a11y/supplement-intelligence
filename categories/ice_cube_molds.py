"""
Ice Cube Molds & Trays — Cocktail Culture / Aesthetic Kitchen.

TikTok brand context: W&P, Bev, OXO (excluded), Tovolo.
Problem profile: diluted drinks, ugly ice, entertaining presentation.
Content potential: HIGH — cocktail content, aesthetic "satisfying" ice videos, entertaining TikTok.
Repeat purchase: LOW-MEDIUM — silicone lasts 2+ years; gifting drives repurchase.
"""
from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="ice_cube_molds",
    display_name="Ice Cube Molds & Trays",
    parent_cat_id=284507,
    subcategories={"Ice Cube Molds & Trays": 2469549011},
    excluded_brands={
        "oxo", "tovolo", "rubbermaid", "amazon", "basics", "solimo",
    },
    expansion_potential=55,
    repeat_purchase_potential=25,
    subscription_eligible=False,
    min_bsr=200,
    max_bsr=15_000,
    min_price=10.0,
    min_monthly_sales=100,
)
