"""
BSR-to-monthly-sales conversion and revenue estimation.

Conversion table based on publicly documented BSR-to-sales velocity
benchmarks for Amazon US general categories. These rates vary by
category — a per-category multiplier should be applied after live
data validation.
"""

import math
from typing import List, Optional, Tuple


BSR_SALES_TABLE: List[Tuple[int, int]] = [
    (50,        12000),
    (100,        8000),
    (200,        5000),
    (500,        2500),
    (1_000,      1200),
    (2_000,       700),
    (5_000,       350),
    (10_000,      170),
    (20_000,       80),
    (50_000,       30),
    (100_000,      10),
    (250_000,       4),
    (500_000,       2),
    (1_000_000,     1),
]


def bsr_to_monthly_sales(bsr: Optional[int]) -> Optional[int]:
    """
    Estimate monthly unit sales from a BSR using log-linear interpolation
    between known benchmark points.
    Returns None if BSR is missing or invalid.
    """
    if not bsr or bsr <= 0:
        return None
    if bsr > 1_000_000:
        return 1

    prev_bsr, prev_sales = 1, BSR_SALES_TABLE[0][1] * 2
    for upper_bsr, sales_at_upper in BSR_SALES_TABLE:
        if bsr <= upper_bsr:
            if prev_bsr == upper_bsr:
                return sales_at_upper
            log_ratio = math.log(bsr / prev_bsr) / math.log(upper_bsr / prev_bsr)
            log_sales = (
                math.log(prev_sales)
                + log_ratio * (math.log(sales_at_upper) - math.log(prev_sales))
            )
            return max(1, round(math.exp(log_sales)))
        prev_bsr, prev_sales = upper_bsr, sales_at_upper

    return 1


# ──────────────────────────────────────────────────────────────────
# Category velocity calibration
#
# Amazon BSR is relative within a category. BSR 3,000 in Kitchen means
# something very different from BSR 3,000 in Industrial & Scientific.
# These multipliers scale the baseline Kitchen estimate to each category.
# Values are approximate — calibrate with live sales data post-launch.
# ──────────────────────────────────────────────────────────────────

CATEGORY_VELOCITY_FACTORS: dict = {
    284507:      1.00,   # Kitchen & Dining (baseline)
    1055398:     0.90,   # Home & Kitchen
    2619533:     0.75,   # Pet Supplies
    2975312091:  0.65,   # Dog
    2975313011:  0.65,   # Cat
    3375251:     0.70,   # Sports & Outdoors
    3407731:     0.65,   # Exercise & Fitness
    3760901:     0.85,   # Health & Personal Care
    165796011:   0.55,   # Baby Products
    15684181:    0.35,   # Automotive
    1064954:     0.45,   # Office Products
    7141123011:  1.20,   # Clothing (high volume)
    3760911:     0.85,   # Beauty & Personal Care
    16310101:    0.12,   # Industrial & Scientific
    228013:      0.30,   # Computers & Accessories
    172282:      0.40,   # Electronics
    130:         0.25,   # Software
}

# Used when root_category is not in the table
DEFAULT_VELOCITY_FACTOR = 0.70


def calibrated_monthly_sales(
    bsr: Optional[int],
    root_category: Optional[int],
) -> Optional[int]:
    """
    BSR → monthly sales with category-specific velocity calibration.
    More accurate than the raw estimate for non-Kitchen categories.
    """
    raw = bsr_to_monthly_sales(bsr)
    if raw is None:
        return None
    factor = CATEGORY_VELOCITY_FACTORS.get(root_category, DEFAULT_VELOCITY_FACTOR)
    return max(1, round(raw * factor))


def monthly_revenue(monthly_sales: Optional[int], price: Optional[float]) -> Optional[float]:
    """Estimate gross monthly revenue from sales volume and selling price."""
    if monthly_sales and price:
        return round(monthly_sales * price, 2)
    return None


def sales_confidence(history_point_count: int, volatility: str) -> int:
    """
    Return an estimated confidence score (0–100) for a sales estimate.
    Lower confidence when history is thin or BSR is highly volatile.
    """
    if history_point_count >= 20 and volatility == "Low":
        return 78
    if history_point_count >= 10:
        return 60
    if history_point_count > 0:
        return 40
    return 15
