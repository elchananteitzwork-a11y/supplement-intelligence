"""V5 component context — superset of V4 MarketContext."""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class MarketContext:
    """All V4 fields + V5 additions. Passed to all V3/V4/V5 components via duck typing."""

    # ── V4 fields (must match v4.components.MarketContext exactly) ──────────
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
    trend_signals_available: bool

    # ── V5 additions ─────────────────────────────────────────────────────────
    repeat_purchase_potential: int   = field(default=50)
    subscription_eligible:     bool  = field(default=False)
    category_name:             str   = field(default="unknown")

    # ── Efficiency signals (V5 replacement for raw review-count gates) ────────
    # category_s2r: total calibrated sales / total review count across scan
    # revenue_generating_pct: fraction of products generating > $3,000/mo
    category_s2r:           float = field(default=0.0)
    revenue_generating_pct: float = field(default=0.0)
