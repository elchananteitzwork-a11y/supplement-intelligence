"""
Data models for the Keepa integration layer.

These dataclasses represent the structured output of each analysis agent.
They are the contract between the Keepa layer and the scoring engine (Phase 2+).

All models serialize to JSON via asdict() from dataclasses module.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional


# ------------------------------------------------------------------
# Core product model (output of keepa-data-fetcher)
# ------------------------------------------------------------------

@dataclass
class PriceSnapshot:
    current_usd: Optional[float]
    avg_90d_usd: Optional[float]
    min_90d_usd: Optional[float]
    max_90d_usd: Optional[float]

    @property
    def range_90d(self) -> Optional[float]:
        if self.max_90d_usd and self.min_90d_usd:
            return round(self.max_90d_usd - self.min_90d_usd, 2)
        return None


@dataclass
class ReviewSnapshot:
    current_count: Optional[int]
    delta_90d: Optional[int]  # reviews gained in last 90 days

    @property
    def monthly_velocity(self) -> Optional[float]:
        """Average reviews gained per month over the last 90 days."""
        if self.delta_90d is not None:
            return round(self.delta_90d / 3.0, 1)
        return None


@dataclass
class NormalizedProduct:
    asin: str
    title: str
    brand: Optional[str]
    root_category: Optional[int]

    # Pricing
    amazon_price: PriceSnapshot
    buybox_price: PriceSnapshot

    # Demand
    current_bsr: Optional[int]
    avg_bsr_90d: Optional[float]
    min_bsr_90d: Optional[int]   # lowest BSR = peak demand period

    # Social proof
    reviews: ReviewSnapshot
    current_rating: Optional[float]

    # Competition
    current_offer_count: Optional[int]

    # Physical (for FBA fee calc)
    package_height_mm: Optional[float]
    package_width_mm: Optional[float]
    package_length_mm: Optional[float]
    package_weight_g: Optional[float]

    # Full time series (list of {timestamp, value})
    bsr_history: List[Dict] = field(default_factory=list)
    review_history: List[Dict] = field(default_factory=list)
    amazon_price_history: List[Dict] = field(default_factory=list)
    buybox_price_history: List[Dict] = field(default_factory=list)
    new_3p_price_history: List[Dict] = field(default_factory=list)


# ------------------------------------------------------------------
# BSR analysis output (bsr-trend-analyzer)
# ------------------------------------------------------------------

@dataclass
class BSRAnalysis:
    asin: str
    title: str

    avg_bsr_90d: Optional[float]
    avg_bsr_30d: Optional[float]
    avg_bsr_365d: Optional[float]

    # Trend: is BSR improving (getting lower = more sales) over 90 days?
    trend_direction: str        # "Improving" | "Stable" | "Declining"
    trend_slope_per_day: Optional[float]  # negative = improving

    # Volatility: how much does BSR jump around?
    bsr_volatility: str         # "Low" | "Medium" | "High"
    bsr_std_dev: Optional[float]

    # Sales estimate derived from BSR
    estimated_monthly_sales: Optional[int]
    sales_estimate_confidence: int  # 0-100

    # Is demand accelerating, stable, or falling?
    demand_velocity: str        # "Accelerating" | "Stable" | "Decelerating"

    # Seasonal pattern detected?
    is_seasonal: bool
    seasonal_peak_month: Optional[str]  # e.g. "November-December"


# ------------------------------------------------------------------
# Review velocity output (review-velocity-tracker)
# ------------------------------------------------------------------

@dataclass
class SellerTierEntry:
    asin: str
    title: str
    review_count: int
    monthly_review_velocity: Optional[float]
    estimated_monthly_sales: Optional[int]   # from BSR analysis
    estimated_monthly_revenue: Optional[float]
    review_to_revenue_efficiency: Optional[float]  # revenue / review_count
    brand: Optional[str]
    listing_age_months: Optional[int]


@dataclass
class ReviewVelocityAnalysis:
    # Tier breakdowns
    tier_under_100:  List[SellerTierEntry]  # sellers with < 100 reviews
    tier_under_500:  List[SellerTierEntry]  # sellers with < 500 reviews
    tier_under_1000: List[SellerTierEntry]  # sellers with < 1,000 reviews

    # Page-1 aggregates
    avg_reviews_page1:    Optional[float]
    median_reviews_page1: Optional[float]
    min_reviews_page1:    Optional[int]

    # Review velocity (category-level)
    avg_monthly_velocity: Optional[float]   # avg new reviews/month across top products
    fastest_grower_asin:  Optional[str]
    fastest_grower_velocity: Optional[float]

    # Category-level Review-to-Revenue Efficiency
    category_avg_r2r_efficiency: Optional[float]
    best_r2r_efficiency:         Optional[float]
    best_r2r_asin:               Optional[str]

    # Accessibility signal
    accessibility_verdict: str  # "Highly Accessible" | "Accessible" | "Hard to Enter" | "Locked"


# ------------------------------------------------------------------
# Price analysis output (price-history-analyzer)
# ------------------------------------------------------------------

@dataclass
class PriceAnalysis:
    # Category-level price range
    category_min_price:  Optional[float]
    category_max_price:  Optional[float]
    category_avg_price:  Optional[float]
    category_median_price: Optional[float]

    # Is the price band tight (race-to-the-bottom)?
    price_band_usd:      Optional[float]  # max - min
    price_compression:   bool             # True if band < $3

    # Price stability: are prices moving down over 90 days?
    price_trend:         str   # "Rising" | "Stable" | "Declining"
    avg_price_delta_90d: Optional[float]  # USD change over 90 days

    # Buy Box dynamics
    amazon_holds_buybox_pct: Optional[float]  # % of time Amazon (not 3P) holds BB

    # Promotional signals
    has_lightning_deal_activity: bool
    coupon_price_detected: bool

    # Per-product summaries (for the top 10 products)
    product_summaries: List[Dict]


# ------------------------------------------------------------------
# Scoring output (product-scorer — Phase 2)
# ------------------------------------------------------------------

@dataclass
class FactorScore:
    name: str
    weight: int       # maximum points possible
    score: float      # points awarded (0 to weight)
    rationale: str    # one-line explanation


@dataclass
class ProductScore:
    asin: str
    title: str
    total_score: float          # 0–100
    grade: str                  # A / B / C / D / F
    verdict: str                # Excellent / Good / Average / Below Average / Poor
    factors: List[FactorScore]
    estimated_monthly_sales: Optional[int]
    estimated_monthly_revenue: Optional[float]


# ------------------------------------------------------------------
# Top-level Keepa report (written to keepa-report.json)
# ------------------------------------------------------------------

@dataclass
class KeepaReport:
    generated_at: str           # ISO 8601
    niche: str
    category_id: Optional[int]
    category_name: Optional[str]
    marketplace: str            # e.g. "US"

    # API usage
    tokens_used_estimate: int
    tokens_remaining: int

    # Product counts
    asins_fetched: int
    products_normalized: int

    # Analysis outputs
    bsr_analyses:    List[BSRAnalysis]
    review_analysis: Optional[ReviewVelocityAnalysis]
    price_analysis:  Optional[PriceAnalysis]

    # Raw normalized products (for downstream use by scoring engine)
    products: List[NormalizedProduct]

    # Scoring (Phase 2)
    product_scores: List[ProductScore] = field(default_factory=list)
