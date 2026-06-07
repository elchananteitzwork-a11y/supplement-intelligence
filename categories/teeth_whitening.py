"""
Teeth Whitening — Oral Beauty.

TikTok brand context: HiSmile, Snow, Crest (strips), Colgate Optic White.
Problem profile: stained teeth from coffee/wine, self-confidence before photos.
Content potential: VERY HIGH — before/after smile photos, results videos.
Repeat purchase: VERY HIGH — strips/pens used monthly; subscription model validated.
"""
from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="teeth_whitening",
    display_name="Teeth Whitening",
    parent_cat_id=3760901,
    subcategories={"Teeth Whitening": 0},  # placeholder; node_validator discovers the correct ID
    excluded_brands={
        "crest", "colgate", "arm & hammer", "listerine",
        "oral-b", "sensodyne", "hismile",
        "amazon", "basics", "solimo",
    },
    expansion_potential=80,
    repeat_purchase_potential=80,
    subscription_eligible=True,
    min_bsr=100,
    max_bsr=20_000,
    min_price=15.0,
    min_monthly_sales=150,
)
