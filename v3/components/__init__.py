"""
V3 component shared types.

Each component module exports a score() function:
    score(product, bsr, ctx) -> ComponentScore

Components score 0–100 independently.
The engine applies weights when computing the final score.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class MarketContext:
    """
    Pre-computed scan-level aggregates built once by the engine before
    scoring any individual product.  Passed to every component.
    """
    # Saturation signals (market_saturation component)
    avg_offer_count:    Optional[float]
    unique_brand_ratio: float           # distinct brands / total products
    amazon_bb_pct:      Optional[float] # % of buy-box held by Amazon direct
    price_band_usd:     Optional[float] # max_price - min_price across scan
    price_compressed:   bool            # True when price_band < $3

    # New seller success signals (new_seller component)
    low_review_winners:      int            # products: reviews < 100 AND avg_bsr < 3000
    avg_velocity_low_review: Optional[float]
    best_r2r_efficiency:     Optional[float]
    avg_r2r_efficiency:      Optional[float]

    # Listing weakness signals (listing_weakness component)
    avg_rating:        Optional[float]
    unknown_brand_pct: float

    # Brand expansion signals (brand_expansion component)
    seasonal_pct:        float
    median_cal_sales:    Optional[int]
    expansion_potential: int            # from CategoryConfig (0–100, default 50)
    category_avg_price:  Optional[float]

    # Efficiency signals (replace raw review-count gates)
    # category_s2r: total estimated monthly sales / total review count across scan
    # revenue_generating_pct: fraction of scanned products generating > $3,000/mo
    category_s2r:            float = 0.0
    revenue_generating_pct:  float = 0.0
