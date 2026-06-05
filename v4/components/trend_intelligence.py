"""
Trend Intelligence Engine — V4's replacement for V3's trend_velocity.

Three-step pipeline:
  1. Gather TrendSignal objects from all sources
  2. Apply anti-hype filter to compute authenticity_score
  3. Dampen raw velocity by authenticity → trend_intelligence_score

When all sources are stubs: returns score=50 (neutral, confidence=0).
Score does NOT penalize stub mode — stubs never hurt a product's ranking.
"""

import re
import statistics
from typing import Any, Dict, List, Optional, Tuple

from keepa.models import BSRAnalysis
from v3.models import ComponentScore, FactorDetail
from v4.components import MarketContext
from v4.components.anti_hype import compute_authenticity, dampen_factor
from v4.models import SourceBreakdown, TrendBreakdown
from v4.sources import TrendDataSourceV4, TrendSignal

WEIGHT = 0.15
_NEUTRAL = 50.0

_STOP_WORDS = {
    "the", "a", "an", "and", "or", "for", "with", "pack", "set", "piece",
    "pcs", "oz", "lb", "count", "in", "of", "by", "new",
}


def score(
    product:       Dict[str, Any],
    bsr:           BSRAnalysis,
    ctx:           MarketContext,
    trend_sources: List[TrendDataSourceV4],
) -> Tuple[ComponentScore, TrendBreakdown]:
    """
    Returns (ComponentScore, TrendBreakdown).
    The engine uses ComponentScore for scoring and TrendBreakdown for output.
    """
    keyword  = _extract_keyword(product.get("title") or bsr.title or "")
    category = str(product.get("root_category") or "")

    # Gather signals
    signals: List[TrendSignal] = []
    source_breakdowns: List[SourceBreakdown] = []
    for src in trend_sources:
        sig = src.get_signal(keyword, category) if src.is_available else None
        if sig:
            signals.append(sig)
        source_breakdowns.append(SourceBreakdown(
            name=src.name,
            weight=src.weight,
            score=sig.trend_score if sig else None,
            momentum_30d=sig.momentum_30d if sig else None,
            momentum_90d=sig.momentum_90d if sig else None,
            authenticity_flags=[],
            is_stub=not src.is_available,
        ))

    all_stubs = not signals

    if all_stubs:
        trend_raw   = _NEUTRAL
        auth_score  = 50.0
        auth_note   = "All trend sources are stubs — returning neutral 50"
        auth_flags: List[str] = []
        trend_final = _NEUTRAL
        confidence  = 0.0
        dominant    = None
    else:
        trend_raw   = _weighted_average(signals, trend_sources)
        auth_score, auth_note, auth_flags = compute_authenticity(signals)
        df           = dampen_factor(auth_score)
        trend_final  = round(trend_raw * df, 1)
        confidence   = _confidence(signals)
        dominant     = _dominant_source(signals, trend_sources)

    breakdown = TrendBreakdown(
        sources=source_breakdowns,
        combined_raw=trend_raw,
        authenticity_score=auth_score,
        trend_score=trend_final,
        dominant_source=dominant,
        all_stubs=all_stubs,
        confidence=confidence,
        authenticity_flags=auth_flags,
    )

    # Construct factors for ComponentScore
    factors = [
        FactorDetail("raw_velocity",      100, trend_raw,   f"Weighted avg across {len(signals)} live source(s)"),
        FactorDetail("authenticity",       100, auth_score,  auth_note),
        FactorDetail("adjusted_velocity",  100, trend_final, f"raw × dampen_factor({auth_score:.0f}/200 + 0.5)"),
    ]
    if auth_flags:
        for flag in auth_flags[:2]:
            factors.append(FactorDetail("anti_hype_flag", 0, 0, flag))

    comp = ComponentScore(
        name="trend_intelligence",
        weight=WEIGHT,
        score=trend_final,
        contribution=round(trend_final * WEIGHT, 2),
        factors=factors,
        confidence=confidence,
        data_sources=[s.name for s in trend_sources],
    )
    return comp, breakdown


def _weighted_average(signals: List[TrendSignal], sources: List[TrendDataSourceV4]) -> float:
    source_map = {s.name: s for s in sources}
    total_w = 0.0
    total_v = 0.0
    for sig in signals:
        src = source_map.get(sig.source_name)
        w   = src.weight if src else 0.1
        total_w += w
        total_v += sig.trend_score * w
    return round(total_v / total_w, 1) if total_w else _NEUTRAL


def _dominant_source(signals: List[TrendSignal], sources: List[TrendDataSourceV4]) -> Optional[str]:
    if not signals:
        return None
    source_map = {s.name: s for s in sources}
    weighted = [(sig.trend_score * (source_map.get(sig.source_name, type('', (), {'weight': 0.1})()).weight), sig.source_name)
                for sig in signals]
    return max(weighted, key=lambda x: x[0])[1] if weighted else None


def _confidence(signals: List[TrendSignal]) -> float:
    if not signals:
        return 0.0
    avg_conf = statistics.mean(s.confidence for s in signals)
    # Bonus for multiple independent sources
    multi_bonus = min(20.0, len(signals) * 5.0)
    return min(95.0, round(avg_conf + multi_bonus, 1))


def _extract_keyword(title: str) -> str:
    """Extract the 2–3 most meaningful product descriptor words from a title."""
    words = re.sub(r"[^a-z\s]", "", title.lower()).split()
    meaningful = [w for w in words if w not in _STOP_WORDS and len(w) > 2]
    return " ".join(meaningful[:3]) if meaningful else title[:40]
