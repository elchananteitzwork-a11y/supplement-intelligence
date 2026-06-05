"""
Pet Supplies — category configuration.

Subcategory IDs verified via live Keepa bestsellers probe (2026-06-04).
BSR range set to 3,000–20,000: Pet Supplies has fewer total listings
than Kitchen, so products with < 200 reviews appear at higher BSR numbers.

NOTE: The subcategory IDs below map to pet accessories / fashion categories
(bandanas, collar accessories, hats) rather than mainstream PL categories
like dog beds or leashes.  Validate product types after first scan and
replace IDs as needed.
"""

from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="pet",
    display_name="Pet Supplies",
    parent_cat_id=2619533,
    subcategories={
        # Verified via Keepa bestsellers probe (2026-06-04)
        "Dog Toys":             2975317011,
        "Dog Beds & Furniture": 2975315011,
        "Pet Grooming":         2975321011,
        "Dog Training":         2975320011,
        "Dog Kennels & Crates": 2975314011,
        "Dog Bowls & Feeders":  2975318011,
        "Pet Doors & Ramps":    2975316011,
    },
    excluded_brands={
        # Dominant pet specialty brands
        "furhaven", "petsafe", "kong", "nylabone", "ruffwear",
        "chuckit", "outward hound", "zippy paws", "west paw",
        # Retail private labels
        "frisco", "reddy",
        # Grooming tools
        "wahl", "andis", "oster",
        # Amazon private label
        "amazon", "solimo", "basics",
    },
    expansion_potential=75,
    repeat_purchase_potential=55,
    subscription_eligible=False,
    min_bsr=1000,
    max_bsr=50_000,
    min_price=15.0,
    min_monthly_sales=150,
    # max_reviews intentionally omitted — review count is no longer a gate
)
