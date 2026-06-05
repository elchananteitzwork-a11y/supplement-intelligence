"""
Layer 3 — Trend Authenticity Score (10%).

Standalone weighted component in V5 (was only a modifier in V4).
Same anti-hype math as V4 — now earns its own 10% of the final score.
"""

from typing import Any, Dict, List, Tuple

from keepa.models import BSRAnalysis
from v3.models import ComponentScore, FactorDetail
from v4.components.anti_hype import compute_authenticity
from v4.sources import TrendSignal
from v5.components import MarketContext

WEIGHT = 0.10


def score(
    product:       Dict[str, Any],
    bsr:           BSRAnalysis,
    ctx:           MarketContext,
    trend_signals: List[TrendSignal],
) -> ComponentScore:
    auth_score, summary, flags = compute_authenticity(trend_signals)

    factors = [FactorDetail("authenticity_aggregate", 100, auth_score, summary)]
    for flag in flags[:2]:
        factors.append(FactorDetail("anti_hype_flag", 0, 0, flag))

    all_stubs = not trend_signals
    conf = 0.0 if all_stubs else min(80.0, 50.0 + len(trend_signals) * 10.0)

    return ComponentScore(
        name="trend_authenticity",
        weight=WEIGHT,
        score=auth_score,
        contribution=round(auth_score * WEIGHT, 2),
        factors=factors,
        confidence=conf,
        data_sources=["trend_sources"],
    )
