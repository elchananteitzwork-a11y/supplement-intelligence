"""
Dog Kennels & Crates — Pet Structural.

TikTok brand context: Diggs, Gunner Kennels, MidWest Homes.
Problem profile: anxiety during travel/absence, unsafe plastic crates, ugly wire crates.
Content potential: MODERATE — crate training videos, aesthetic pet spaces.
Repeat purchase: LOW — one-time purchase; size upgrades as puppy grows.
"""
from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="dog_kennels",
    display_name="Dog Kennels & Crates",
    parent_cat_id=2619533,
    subcategories={"Dog Kennels & Crates": 0},  # placeholder; node_validator discovers the correct ID
    excluded_brands={
        "midwest homes", "petmate", "diggs", "gunner",
        "precision pet", "frisco", "amazon", "basics",
    },
    expansion_potential=45,
    repeat_purchase_potential=15,
    subscription_eligible=False,
    min_bsr=200,
    max_bsr=15_000,
    min_price=25.0,
    min_monthly_sales=100,
)
