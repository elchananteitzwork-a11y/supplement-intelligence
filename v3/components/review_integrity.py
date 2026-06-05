"""
Component 7 — Review Integrity Score (5% of Final Opportunity Score).

Detects review manipulation via Keepa review_count history deltas.
Acts as a GATE in the recommendation logic — not just a weighted contributor.

Gate rules (enforced in v3/engine.py):
  score < 40 → REJECT  (overrides all other scores)
  score < 60 → cannot reach STRONG OPPORTUNITY

Why this component exists:
  V2 had no integrity check.  Kitchen deep-validation (2026-06-04) showed
  3/3 top-ranked products received manual REJECT for Amazon review wipes.
  Wipe patterns were present in Keepa history — V2 never read them.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from keepa.models import BSRAnalysis
from v3.components import MarketContext
from v3.models import ComponentScore, FactorDetail

WEIGHT = 0.05

# A drop counts as a "wipe" when BOTH thresholds are exceeded
WIPE_MIN_ABSOLUTE = 20    # minimum absolute review drop
WIPE_MIN_PCT      = 0.15  # minimum % of previous count


def score(
    product: Dict[str, Any],
    bsr:     BSRAnalysis,
    ctx:     MarketContext,
) -> ComponentScore:
    review_hist = product.get("history", {}).get("review_count", [])
    wipes       = _detect_wipes(review_hist)
    n_wipes     = len(wipes)

    score_val, rationale = _score_from_wipes(wipes, len(review_hist))
    conf = _confidence(len(review_hist))

    wipe_detail = _format_wipe_detail(wipes)

    return ComponentScore(
        name="review_integrity",
        weight=WEIGHT,
        score=score_val,
        contribution=round(score_val * WEIGHT, 2),
        factors=[
            FactorDetail("wipe_detection", 100, score_val, rationale),
        ],
        confidence=conf,
        data_sources=["keepa"],
    )


def detect_wipes(product: Dict[str, Any]) -> Tuple[int, str]:
    """Public helper for the engine to extract wipe count + detail without a full score."""
    review_hist = product.get("history", {}).get("review_count", [])
    wipes = _detect_wipes(review_hist)
    return len(wipes), _format_wipe_detail(wipes)


def _detect_wipes(review_history: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Identify wipe events in review count history.
    A wipe is a single observation where review count drops by
    ≥ WIPE_MIN_ABSOLUTE reviews AND ≥ WIPE_MIN_PCT of the previous count.
    """
    if len(review_history) < 2:
        return []

    try:
        sorted_hist = sorted(
            [(datetime.fromisoformat(e["timestamp"]), int(e["value"]))
             for e in review_history
             if e.get("timestamp") and e.get("value") is not None],
            key=lambda x: x[0],
        )
    except (KeyError, ValueError):
        return []

    wipes = []
    for i in range(1, len(sorted_hist)):
        prev_ts, prev_val = sorted_hist[i - 1]
        curr_ts, curr_val = sorted_hist[i]
        if curr_val >= prev_val:
            continue
        drop     = prev_val - curr_val
        pct_drop = drop / prev_val if prev_val > 0 else 0.0
        if drop >= WIPE_MIN_ABSOLUTE and pct_drop >= WIPE_MIN_PCT:
            wipes.append({
                "timestamp": curr_ts.isoformat(),
                "before":    prev_val,
                "after":     curr_val,
                "drop":      drop,
                "pct_drop":  round(pct_drop * 100, 1),
            })
    return wipes


def _score_from_wipes(
    wipes:    List[Dict[str, Any]],
    hist_len: int,
) -> Tuple[float, str]:
    n = len(wipes)

    if hist_len < 3:
        return 50.0, "Insufficient review history (< 3 data points) — unverifiable"

    if n == 0:
        return 100.0, "Clean review history — no manipulation signals detected"

    if n == 1:
        drop = wipes[0]["drop"]
        if drop < 50:
            return 75.0, f"1 minor wipe ({drop} reviews) — low concern"
        if drop < 200:
            return 55.0, f"1 moderate wipe ({drop} reviews) — investigation recommended"
        return 30.0, f"1 severe wipe ({drop} reviews removed) — likely Amazon penalty"

    if n == 2:
        total_dropped = sum(w["drop"] for w in wipes)
        return 20.0, f"2 wipe events ({total_dropped} total reviews removed) — manipulation pattern"

    total_dropped = sum(w["drop"] for w in wipes)
    return 10.0, f"{n} wipe events ({total_dropped} total reviews removed) — systematic manipulation"


def _format_wipe_detail(wipes: List[Dict[str, Any]]) -> str:
    if not wipes:
        return "clean"
    parts = []
    for w in wipes:
        parts.append(
            f"{w['before']}→{w['after']} on {w['timestamp'][:10]} "
            f"({w['drop']} reviews, {w['pct_drop']:.0f}% drop)"
        )
    return " | ".join(parts)


def _confidence(hist_len: int) -> float:
    if hist_len >= 10:
        return 85.0
    if hist_len >= 5:
        return 65.0
    if hist_len >= 3:
        return 45.0
    return 20.0
