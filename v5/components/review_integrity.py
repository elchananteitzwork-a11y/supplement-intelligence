"""Layer 5 — Review Integrity Score (10%). Weight doubled from V4's 5%."""

from typing import Any, Dict

from keepa.models import BSRAnalysis
from v3.models import ComponentScore, FactorDetail
from v3.components.review_integrity import score as _v3_score
from v5.components import MarketContext

WEIGHT = 0.10


def score(product: Dict[str, Any], bsr: BSRAnalysis, ctx: MarketContext) -> ComponentScore:
    v3_comp = _v3_score(product, bsr, ctx)
    return ComponentScore(
        name="review_integrity",
        weight=WEIGHT,
        score=v3_comp.score,
        contribution=round(v3_comp.score * WEIGHT, 2),
        factors=v3_comp.factors,
        confidence=v3_comp.confidence,
        data_sources=v3_comp.data_sources,
    )


# Re-export detect_wipes for the engine
from v3.components.review_integrity import detect_wipes  # noqa: F401
