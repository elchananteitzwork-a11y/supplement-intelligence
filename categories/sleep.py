"""
Sleep Supplements — Melatonin, Magnesium, Ashwagandha, Sleep Blends.

TikTok brand context: Beam Dream Powder, Olly Sleep, Moon Juice.
Problem profile: difficulty falling asleep, early waking, sleep quality.
Content potential: HIGH — nighttime routine videos, morning-after comparisons.
Repeat purchase: VERY HIGH — daily supplement, subscription validated.

Subcategory IDs use confirmed Magnesium node (26879851011) plus estimates
for broader sleep supplement categories. The Magnesium node reliably returns
sleep-adjacent products (glycinate, threonate formulas marketed for sleep).
"""

from categories import CategoryConfig

CONFIG = CategoryConfig(
    name="sleep",
    display_name="Sleep Supplements",
    parent_cat_id=6973753011,
    subcategories={
        # Confirmed from existing supplements.py config
        "Magnesium":               26879851011,
        # Estimates — validate before production
        "Sleep Aid Supplements":    3774451,   # estimate
        "Stress & Anxiety Relief":  3774461,   # maps to amino acids node
    },
    excluded_brands={
        # OTC pharma / mass market
        "zzzquil", "unisom", "sominex", "tylenol pm", "advil pm",
        "luna", "natrol",
        # Established supplement brands
        "now foods", "nature made", "nature's bounty", "natures bounty",
        "doctor's best", "pure encapsulations", "thorne",
        "kirkland", "member's mark",
        "amazon", "solimo", "basics",
    },
    expansion_potential=85,
    repeat_purchase_potential=90,
    subscription_eligible=True,
    min_bsr=500,
    max_bsr=50_000,
    min_price=20.0,
    min_monthly_sales=150,
    # max_reviews intentionally omitted — review count is not a gate
)
