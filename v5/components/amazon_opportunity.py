"""
Layer 4 — Amazon Opportunity Score (15%).

Consolidates V3's three separate Amazon components (demand + new_seller +
market_saturation) into a single entry-window metric.

  demand_quality       × 0.35  (BSR trend, calibrated sales)
  market_accessibility × 0.35  (new sellers winning, review barrier)
  competition_openness × 0.30  (saturation, Amazon presence, price spread)

Keeps all V3 logic intact — just reweights and combines.
"""

from typing import Any, Dict, Tuple

from keepa.models import BSRAnalysis, PriceAnalysis
from v3.models import ComponentScore, FactorDetail
import v3.components.demand          as _demand
import v3.components.new_seller      as _new_seller
import v3.components.market_saturation as _market_saturation
from v5.components import MarketContext

WEIGHT = 0.15


def score(
    product:        Dict[str, Any],
    bsr:            BSRAnalysis,
    ctx:            MarketContext,
    price_analysis: PriceAnalysis,
) -> Tuple[ComponentScore, Dict[str, ComponentScore]]:
    c_demand = _demand.score(product, bsr, ctx, price_analysis)
    c_ns     = _new_seller.score(product, bsr, ctx)
    c_ms     = _market_saturation.score(product, bsr, ctx, price_analysis)

    combined = round(
        c_demand.score * 0.35
        + c_ns.score   * 0.35
        + c_ms.score   * 0.30,
        1,
    )
    conf = round(
        c_demand.confidence * 0.35
        + c_ns.confidence   * 0.35
        + c_ms.confidence   * 0.30,
        1,
    )

    return ComponentScore(
        name="amazon_opportunity",
        weight=WEIGHT,
        score=combined,
        contribution=round(combined * WEIGHT, 2),
        factors=[
            FactorDetail(
                "demand_quality", 35,
                round(c_demand.score * 0.35, 1),
                f"Demand: {c_demand.score:.0f}/100 — "
                + (max(c_demand.factors, key=lambda f: f.points).rationale[:60]
                   if c_demand.factors else ""),
            ),
            FactorDetail(
                "market_accessibility", 35,
                round(c_ns.score * 0.35, 1),
                f"New seller success: {c_ns.score:.0f}/100 — "
                + (max(c_ns.factors, key=lambda f: f.points).rationale[:60]
                   if c_ns.factors else ""),
            ),
            FactorDetail(
                "competition_openness", 30,
                round(c_ms.score * 0.30, 1),
                f"Market saturation: {c_ms.score:.0f}/100 — "
                + (max(c_ms.factors, key=lambda f: f.points).rationale[:60]
                   if c_ms.factors else ""),
            ),
        ],
        confidence=conf,
        data_sources=["keepa"],
    ), {"demand": c_demand, "new_seller": c_ns, "market_saturation": c_ms}
