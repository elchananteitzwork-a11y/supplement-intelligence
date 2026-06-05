"""V3 data models."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class FactorDetail:
    name:       str
    max_points: float
    points:     float
    rationale:  str


@dataclass
class ComponentScore:
    name:         str
    weight:       float        # fraction of final score (0.0–1.0)
    score:        float        # 0–100 normalized
    contribution: float        # score × weight
    factors:      List[FactorDetail]
    confidence:   float        # 0–100 (data quality signal, informational only)
    data_sources: List[str] = field(default_factory=list)


@dataclass
class OpportunityScore:
    asin:  str
    title: str
    brand: Optional[str]

    # 7 component scores
    demand:            ComponentScore
    new_seller:        ComponentScore
    listing_weakness:  ComponentScore
    trend_velocity:    ComponentScore
    market_saturation: ComponentScore
    brand_expansion:   ComponentScore
    review_integrity:  ComponentScore

    # Aggregate
    final_score: float
    confidence:  float

    # Market metrics
    estimated_monthly_sales:   Optional[int]
    estimated_monthly_revenue: Optional[float]
    price:                     Optional[float]

    # Unit economics
    fba_size_tier:  str
    fba_fee:        Optional[float]
    net_margin_pct: Optional[float]

    # Review integrity detail (surfaced at top level for fast filtering)
    wipe_events: int
    wipe_detail: str

    # Human-readable labels
    competition_level: str   # Low / Medium / High
    risk_level:        str   # Low / Medium / High
    recommendation:    str   # STRONG OPPORTUNITY / WORTH RESEARCH / REJECT
