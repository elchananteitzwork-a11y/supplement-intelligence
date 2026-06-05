"""V5 data models."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from v3.models import ComponentScore, FactorDetail


@dataclass
class BonusBreakdown:
    """Which V5 bonuses activated and why."""
    external_acceleration: float   # 0 or 10
    subscription_model:    float   # 0 or 10
    multi_sku_potential:   float   # 0 or 10
    total:                 float

    external_reason:    str
    subscription_reason: str
    multi_sku_reason:   str


@dataclass
class V5Narrative:
    """Full brand-intelligence analysis per product."""
    why_people_want_it:     str   # Layer 1 problem framing
    why_growing:            str   # Layer 2 trend framing
    why_gap_exists:         str   # Layer 8 gap framing
    copy_difficulty:        str   # Low / Medium / High / Very High
    copy_difficulty_reason: str
    brand_assessment:       str   # Full 4-dimension brand evaluation
    time_to_saturation:     str   # Categorical estimate
    pl_suitability:         str   # EXCELLENT / GOOD / VIABLE / DIFFICULT / NOT SUITABLE
    brand_potential:        str   # ICONIC / STRONG / CANDIDATE / SINGLE SKU / COMMODITY
    top_risks:              List[str]
    recommended_action:     str


@dataclass
class V5OpportunityScore:
    asin:     str
    title:    str
    brand:    Optional[str]
    category: Optional[str]

    # 7 weighted components
    problem_score:      ComponentScore   # 20%
    trend_velocity:     ComponentScore   # 15%
    trend_authenticity: ComponentScore   # 10%
    amazon_opportunity: ComponentScore   # 15%
    review_integrity:   ComponentScore   # 10%
    repeat_purchase:    ComponentScore   # 15%
    brandability:       ComponentScore   # 15%

    # Bonus breakdown
    bonuses:            BonusBreakdown
    amazon_gap_score:   float   # informational (0–100)

    # Scores
    base_score:  float
    final_score: float
    confidence:  float

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

    # V5 enriched output
    narrative: V5Narrative

    # Labels
    competition_level: str   # Low / Medium / High
    risk_level:        str   # Low / Medium / High
    recommendation:    str   # ICONIC BRAND POTENTIAL / STRONG OPPORTUNITY / WORTH RESEARCH / REJECT
