"""V4 data models."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from v3.models import ComponentScore, FactorDetail  # reuse V3 models


@dataclass
class SourceBreakdown:
    name:       str
    weight:     float
    score:      Optional[float]   # None when stub
    momentum_30d: Optional[float]
    momentum_90d: Optional[float]
    authenticity_flags: List[str]
    is_stub:    bool


@dataclass
class TrendBreakdown:
    """Aggregated result of all trend sources after anti-hype filtering."""
    sources:           List[SourceBreakdown]
    combined_raw:      float   # weighted average before anti-hype dampening
    authenticity_score: float  # 0–100 from anti-hype filter
    trend_score:       float   # final adjusted score (= combined_raw × dampen_factor)
    dominant_source:   Optional[str]
    all_stubs:         bool
    confidence:        float
    authenticity_flags: List[str]  # top concerns, if any


@dataclass
class ProductNarrative:
    """Human-readable explanations derived from scoring data."""
    why_growing:            str
    why_gap_exists:         str
    pl_suitability_label:   str   # EXCELLENT / GOOD / VIABLE / DIFFICULT / NOT SUITABLE
    pl_suitability_reason:  str
    brand_potential_label:  str   # FUTURE BRAND / BRAND CANDIDATE / SINGLE SKU / COMMODITY RISK
    brand_potential_reason: str
    top_risks:              List[str]
    recommended_action:     str


@dataclass
class V4OpportunityScore:
    asin:     str
    title:    str
    brand:    Optional[str]
    category: Optional[str]

    # V3 component scores (inherited, unchanged)
    demand:            ComponentScore
    new_seller:        ComponentScore
    listing_weakness:  ComponentScore
    market_saturation: ComponentScore
    brand_expansion:   ComponentScore
    review_integrity:  ComponentScore

    # V4 trend component
    trend_intelligence: ComponentScore   # replaces V3's trend_velocity

    # V4 new scores (not weighted components — informational + bonus)
    authenticity_score:    float   # 0–100 from anti-hype filter
    opportunity_gap_score: float   # 0–100 (external trend vs Amazon capture)
    opportunity_gap_bonus: float   # 0 or +10

    # Aggregate
    base_score:  float   # weighted sum (0–100)
    final_score: float   # base_score + bonus, capped at 100
    confidence:  float   # 0–100

    # Economics
    estimated_monthly_sales:   Optional[int]
    estimated_monthly_revenue: Optional[float]
    price:                     Optional[float]
    fba_size_tier:             str
    fba_fee:                   Optional[float]
    net_margin_pct:            Optional[float]

    # Review integrity detail
    wipe_events: int
    wipe_detail: str

    # V4 enriched output
    trend_breakdown: TrendBreakdown
    narrative:       ProductNarrative

    # Labels
    competition_level: str   # Low / Medium / High
    risk_level:        str   # Low / Medium / High
    recommendation:    str   # STRONG OPPORTUNITY / WORTH RESEARCH / REJECT
