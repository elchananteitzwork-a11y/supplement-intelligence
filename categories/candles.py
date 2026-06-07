"""
Candles — Home Fragrance & Lifestyle.

TikTok brand context: Boy Smells, Homesick, P.F. Candle Co., Forvr Mood.
Problem profile: home ambiance, self-care ritual, gifting.
Content potential: HIGH — aesthetic flat-lays, room transformation, scent storytelling.
Repeat purchase: HIGH — burns through in 40-60 hours; buyers repurchase monthly.
"""
from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="candles",
    display_name="Scented Candles",
    parent_cat_id=1055398,
    subcategories={"Candles": 3734291},
    excluded_brands={
        "yankee candle", "bath & body works", "woodwick",
        "voluspa", "chesapeake bay", "glade", "febreze",
        "amazon", "basics", "solimo",
    },
    expansion_potential=75,
    repeat_purchase_potential=65,
    subscription_eligible=False,
    min_bsr=100,
    max_bsr=15_000,
    min_price=15.0,
    min_monthly_sales=100,
)
