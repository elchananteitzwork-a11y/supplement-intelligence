"""
V4 component context.

V4's MarketContext contains all V3 fields plus a trend availability flag.
All V3 components (demand, new_seller, etc.) accept this context via
duck typing — they only read V3 fields, which are all present here.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class MarketContext:
    """Superset of V3 MarketContext. Pass to both V3 and V4 components."""

    # ── V3 fields (must match v3.components.MarketContext exactly) ───────────
    avg_offer_count:         Optional[float]
    unique_brand_ratio:      float
    amazon_bb_pct:           Optional[float]
    price_band_usd:          Optional[float]
    price_compressed:        bool
    low_review_winners:      int
    avg_velocity_low_review: Optional[float]
    best_r2r_efficiency:     Optional[float]
    avg_r2r_efficiency:      Optional[float]
    avg_rating:              Optional[float]
    unknown_brand_pct:       float
    seasonal_pct:            float
    median_cal_sales:        Optional[int]
    expansion_potential:     int
    category_avg_price:      Optional[float]

    # ── V4 additions ─────────────────────────────────────────────────────────
    trend_signals_available: bool = field(default=False)
