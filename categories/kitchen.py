"""
Kitchen & Dining — category configuration.

BSR range and subcategory IDs confirmed from live Keepa scans (2026-06-04).
These values were previously hardcoded in keepa/discovery.py and
run_discovery.py; this file is now the canonical source.
"""

from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="kitchen",
    display_name="Kitchen & Dining",
    parent_cat_id=284507,
    subcategories={
        "Cutting Boards, Mats & Sets":    23944790011,
        "Ice Cube Molds & Trays":          2469549011,
        "Dish Cloths & Dish Towels":           3741991,
        "Measuring Tools & Scales":             289785,
        "Kitchen Storage & Organization":      3744031,
        "Cooking Utensils":                   16439841,
        "Reusable Straws":                 21331300011,
        "Potholders & Oven Mitts":             3742011,
    },
    excluded_brands={
        # Dominant appliance / drinkware brands
        "yeti", "ninja", "stanley", "hydrojug", "gorilla grip",
        "sharkninja", "hydro flask", "nalgene",
        "cuisinart", "kitchenaid", "instant pot", "instant brands", "breville",
        "hamilton beach", "keurig",
        # Dominant in specific niches (confirmed from live scan)
        "rubbermaid", "oxo", "lodge", "tramontina", "etekcity", "cosori",
        "homaxy", "hotor", "sok it", "gorilla",
        # Amazon private label
        "amazon", "solimo", "pinzon", "basics",
        # Premium cookware
        "viking", "all-clad", "le creuset", "calphalon",
        "ninja foodi",
    },
    min_bsr=500,
    max_bsr=5000,
    min_price=20.0,
    min_monthly_sales=300,
    max_reviews=200,
)
