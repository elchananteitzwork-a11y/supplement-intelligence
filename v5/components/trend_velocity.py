"""Layer 2 — Trend Velocity Score (15%). Thin wrapper on V4's trend intelligence."""

from typing import Any, Dict, List, Tuple

from keepa.models import BSRAnalysis
from v3.models import ComponentScore, FactorDetail
from v4.components.trend_intelligence import score as _v4_score
from v4.models import TrendBreakdown
from v5.components import MarketContext

WEIGHT = 0.15


def score(
    product:       Dict[str, Any],
    bsr:           BSRAnalysis,
    ctx:           MarketContext,
    trend_sources: list,
) -> Tuple[ComponentScore, TrendBreakdown]:
    v4_comp, breakdown = _v4_score(product, bsr, ctx, trend_sources)
    comp = ComponentScore(
        name="trend_velocity",
        weight=WEIGHT,
        score=v4_comp.score,
        contribution=round(v4_comp.score * WEIGHT, 2),
        factors=v4_comp.factors,
        confidence=v4_comp.confidence,
        data_sources=v4_comp.data_sources,
    )
    return comp, breakdown
