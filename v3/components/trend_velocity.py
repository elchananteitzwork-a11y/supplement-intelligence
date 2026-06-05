"""
Component 4 — Trend Velocity Score (15% of Final Opportunity Score).

Detects growing demand BEFORE Amazon BSR fully reflects it.

All sources are currently stubs.  When no source has is_available=True,
this component returns a neutral score of 50 — no penalty, no bonus.

To activate a source: implement TrendDataSource, set is_available=True,
pass to v3.engine.run(trend_sources=[...]).
"""

import re
from typing import Any, Dict, List, Optional, Tuple

from keepa.models import BSRAnalysis
from v3.components import MarketContext
from v3.models import ComponentScore, FactorDetail
from v3.sources import TrendDataSource

WEIGHT = 0.15
_NEUTRAL = 50.0
_STOP_WORDS = {
    "the", "a", "an", "and", "or", "for", "with", "pack", "set", "piece",
    "pcs", "oz", "lb", "count", "in", "of", "by",
}


def score(
    product:       Dict[str, Any],
    bsr:           BSRAnalysis,
    ctx:           MarketContext,
    trend_sources: List[TrendDataSource],
) -> ComponentScore:
    keyword  = _extract_keyword(product.get("title") or bsr.title or "")
    category = str(product.get("root_category") or "")

    live = [(s, s.get_score(keyword, category)) for s in trend_sources if s.is_available]
    live = [(s, v) for s, v in live if v is not None]

    if not live:
        stub_names = [s.name for s in trend_sources]
        note = (
            f"No live trend sources — {len(trend_sources)} configured "
            f"({', '.join(stub_names) or 'none'}), all stubs"
        )
        return ComponentScore(
            name="trend_velocity",
            weight=WEIGHT,
            score=_NEUTRAL,
            contribution=round(_NEUTRAL * WEIGHT, 2),
            factors=[FactorDetail("trend_aggregate", 100, _NEUTRAL, note)],
            confidence=0.0,
            data_sources=[s.name for s in trend_sources],
        )

    total_weight = sum(s.weight for s, _ in live)
    combined = sum(v * (s.weight / total_weight) for s, v in live)
    score_val = round(combined, 1)
    sources_used = ", ".join(s.name for s, _ in live)
    note = f"Aggregated from {len(live)} source(s): {sources_used} (keyword: '{keyword}')"

    return ComponentScore(
        name="trend_velocity",
        weight=WEIGHT,
        score=score_val,
        contribution=round(score_val * WEIGHT, 2),
        factors=[
            FactorDetail(s.name, 100, round(v, 1), f"{s.name}: {v:.0f}/100")
            for s, v in live
        ],
        confidence=70.0,
        data_sources=[s.name for s, _ in live],
    )


def _extract_keyword(title: str) -> str:
    """Extract the 2–3 most meaningful words from a product title."""
    words = re.sub(r"[^a-z\s]", "", title.lower()).split()
    meaningful = [w for w in words if w not in _STOP_WORDS and len(w) > 2]
    return " ".join(meaningful[:3]) if meaningful else title[:40]
