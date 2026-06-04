"""
Beauty & Personal Care — category configuration.

NOTE: Subcategory IDs below are estimates and must be validated against
live Keepa data before running a scan.  Run:

    python run_discovery.py --check-tokens
    python run_discovery.py beauty --max-subcategories 1 --max-reviews 500

and check whether returned ASINs match the expected product types.

BSR range set to 1,000–12,000 as a starting estimate.  Beauty is a
high-velocity category; calibrate after first live scan.
"""

from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="beauty",
    display_name="Beauty & Personal Care",
    parent_cat_id=3760911,
    subcategories={
        # NOTE: validate IDs before first live scan
        "Makeup Brushes & Tools":    11059921,
        "Nail Art & Equipment":        3777991,
        "Hair Accessories":         1571280011,
        "Eyelash Accessories":         3777931,
        "Face Masks & Treatments":  7722931011,
        "Skin Care Tools":            11058931,
    },
    excluded_brands={
        # Mass-market drugstore
        "revlon", "l'oreal", "loreal", "maybelline", "neutrogena",
        "dove", "olay", "pantene", "garnier",
        # Clinical / prestige
        "cerave", "the ordinary", "la roche-posay", "paula's choice",
        # Color cosmetics
        "tarte", "urban decay", "nyx", "e.l.f.", "elf", "wet n wild",
        # Hair tools
        "conair", "remington", "chi", "dyson",
        # Amazon private label
        "amazon", "solimo", "basics",
    },
    min_bsr=1000,
    max_bsr=12000,
    min_price=15.0,
    min_monthly_sales=200,
    max_reviews=200,
)
