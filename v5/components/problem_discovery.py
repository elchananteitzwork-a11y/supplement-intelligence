"""
Layer 1 — Problem Discovery Score (20% of Final Opportunity Score).

Answers: "Are consumers actively articulating the problem this product solves?"

The brands V5 targets were not found by scanning Amazon. They were found by
listening: "I hate that..." / "I wish there was..." / "I'm struggling with..."

Sub-factors (total = 100):
  Complaint Frequency (30) — how often does the problem appear?
  Growth Rate (20)         — is discussion growing?
  Emotional Intensity (20) — how strongly do people feel it?
  Purchase Intent (20)     — does discussion imply buying?
  Solution Scarcity (10)   — are existing solutions poorly rated?

Stub mode: Amazon avg_rating used as solution-scarcity proxy.
Full signal requires Reddit, Quora, TikTok comments sources.
Stub confidence: 35%. Live confidence: 70–85%.
"""

from typing import Any, Dict, List, Optional, Tuple

from keepa.models import BSRAnalysis
from v3.models import ComponentScore, FactorDetail
from v5.components import MarketContext
from v5.sources import ProblemDataSource, ProblemSignal

WEIGHT = 0.20

# Category → known problem intensity (0–100)
_CATEGORY_PROBLEM_INTENSITY = {
    "supplements": 85,
    "beauty":      75,
    "pet":         65,
    "kitchen":     40,
}

# Category → emotional framing (for narrative)
_CATEGORY_FRAMES = {
    "supplements": "Consumers actively seek solutions for gut health, sleep, energy, and recovery",
    "beauty":      "Consumers seek effective, clean-ingredient solutions for skin and hair",
    "pet":         "Pet owners invest emotionally in their pets' health and comfort",
    "kitchen":     "Home cooks seek tools that reduce friction and improve results",
}


def score(
    product:         Dict[str, Any],
    bsr:             BSRAnalysis,
    ctx:             MarketContext,
    problem_sources: List[ProblemDataSource],
) -> ComponentScore:
    live = [s for s in problem_sources if s.is_available]

    if not live:
        return _stub_score(product, bsr, ctx)

    # Aggregate live signals
    from v5.sources import ProblemSignal
    keyword  = _keyword(product.get("title") or bsr.title or "")
    category = ctx.category_name
    signals  = [sig for s in live for sig in [s.get_signal(keyword, category)] if sig]

    if not signals:
        return _stub_score(product, bsr, ctx)

    return _live_score(signals, ctx)


def _stub_score(
    product: Dict[str, Any],
    bsr:     BSRAnalysis,
    ctx:     MarketContext,
) -> ComponentScore:
    """Amazon-proxy stub: uses avg_rating + category heuristics."""
    rating  = ctx.avg_rating
    cat     = ctx.category_name.lower()

    f_freq     = _stub_complaint_freq(rating)
    f_growth   = (10.0, "Growth rate unknown — problem sources not integrated")
    f_emotion  = _stub_emotional_intensity(cat, ctx.repeat_purchase_potential)
    f_intent   = _stub_purchase_intent(ctx.repeat_purchase_potential)
    f_scarcity = _stub_solution_scarcity(rating)

    raw = f_freq[0] + f_growth[0] + f_emotion[0] + f_intent[0] + f_scarcity[0]
    score_val = min(100.0, round(raw, 1))

    return ComponentScore(
        name="problem_discovery",
        weight=WEIGHT,
        score=score_val,
        contribution=round(score_val * WEIGHT, 2),
        factors=[
            FactorDetail("complaint_frequency",  30, f_freq[0],     f_freq[1]),
            FactorDetail("growth_rate",           20, f_growth[0],   f_growth[1]),
            FactorDetail("emotional_intensity",   20, f_emotion[0],  f_emotion[1]),
            FactorDetail("purchase_intent",       20, f_intent[0],   f_intent[1]),
            FactorDetail("solution_scarcity",     10, f_scarcity[0], f_scarcity[1]),
        ],
        confidence=35.0,
        data_sources=["keepa_rating_proxy"],
    )


def _live_score(signals: List[ProblemSignal], ctx: MarketContext) -> ComponentScore:
    def _avg(attr):
        vals = [getattr(s, attr) for s in signals if getattr(s, attr) is not None]
        return sum(vals) / len(vals) if vals else None

    avg_mentions   = _avg("mention_count")
    avg_growth     = _avg("growth_rate_30d")
    avg_intensity  = _avg("emotional_intensity")
    avg_intent     = _avg("purchase_intent")
    avg_scarcity   = _avg("solution_scarcity")

    f_freq    = _live_complaint_freq(avg_mentions)
    f_growth  = _live_growth(avg_growth)
    f_emotion = _live_emotion(avg_intensity)
    f_intent  = _live_intent(avg_intent)
    f_scarcity = _live_scarcity(avg_scarcity)

    raw = f_freq[0] + f_growth[0] + f_emotion[0] + f_intent[0] + f_scarcity[0]
    score_val = min(100.0, round(raw, 1))
    conf = min(85.0, 55.0 + len(signals) * 10.0)

    return ComponentScore(
        name="problem_discovery",
        weight=WEIGHT,
        score=score_val,
        contribution=round(score_val * WEIGHT, 2),
        factors=[
            FactorDetail("complaint_frequency",  30, f_freq[0],     f_freq[1]),
            FactorDetail("growth_rate",           20, f_growth[0],   f_growth[1]),
            FactorDetail("emotional_intensity",   20, f_emotion[0],  f_emotion[1]),
            FactorDetail("purchase_intent",       20, f_intent[0],   f_intent[1]),
            FactorDetail("solution_scarcity",     10, f_scarcity[0], f_scarcity[1]),
        ],
        confidence=conf,
        data_sources=[s.source_name for s in signals],
    )


# ── Stub factor functions ─────────────────────────────────────────────────────

def _stub_complaint_freq(rating: Optional[float]) -> Tuple[float, str]:
    if rating is None:
        return 15.0, "Rating unavailable — using category baseline"
    if rating < 3.8:  return 26.0, f"Avg rating {rating:.1f} — significant complaint volume documented"
    if rating < 4.0:  return 20.0, f"Avg rating {rating:.1f} — notable complaints in reviews"
    if rating < 4.2:  return 14.0, f"Avg rating {rating:.1f} — moderate complaint signal"
    if rating < 4.4:  return  9.0, f"Avg rating {rating:.1f} — low complaint volume"
    return 5.0, f"Avg rating {rating:.1f} — minimal complaints; problem may be well-solved"


def _stub_emotional_intensity(cat: str, rpp: int) -> Tuple[float, str]:
    intensity = _CATEGORY_PROBLEM_INTENSITY.get(cat, 50)
    pts = round(intensity * 0.18, 1)  # 0–100 → 0–18 pts (max 18 ≤ 20)
    frame = _CATEGORY_FRAMES.get(cat, "Consumers seek solutions in this category")
    return pts, f"{frame} (category intensity: {intensity}/100)"


def _stub_purchase_intent(rpp: int) -> Tuple[float, str]:
    if rpp >= 70: return 16.0, f"High repeat purchase ({rpp}/100) → strong buying intent signal"
    if rpp >= 50: return 12.0, f"Moderate repeat purchase ({rpp}/100) → moderate buying intent"
    if rpp >= 30: return  8.0, f"Lower repeat purchase ({rpp}/100) → occasional buying intent"
    return 5.0, f"Low repeat purchase ({rpp}/100) → one-time purchase signal"


def _stub_solution_scarcity(rating: Optional[float]) -> Tuple[float, str]:
    if rating is None:
        return 4.0, "Solution scarcity unknown — rating data unavailable"
    if rating < 3.8:  return 10.0, f"Rating {rating:.1f} — existing solutions widely criticized"
    if rating < 4.0:  return  8.0, f"Rating {rating:.1f} — existing solutions below expectations"
    if rating < 4.2:  return  5.0, f"Rating {rating:.1f} — modest improvement gap"
    return 2.0, f"Rating {rating:.1f} — existing solutions mostly adequate"


# ── Live factor functions ─────────────────────────────────────────────────────

def _live_complaint_freq(mentions: Optional[float]) -> Tuple[float, str]:
    if mentions is None:
        return 12.0, "Mention count unavailable"
    m = int(mentions)
    if m >= 5000: return 30.0, f"{m:,} monthly mentions — dominant problem"
    if m >= 2000: return 24.0, f"{m:,} monthly mentions — high problem awareness"
    if m >= 500:  return 18.0, f"{m:,} monthly mentions — moderate awareness"
    if m >= 100:  return 11.0, f"{m:,} monthly mentions — emerging problem"
    return 5.0, f"{m:,} monthly mentions — low awareness"


def _live_growth(rate: Optional[float]) -> Tuple[float, str]:
    if rate is None:
        return 10.0, "Growth rate unavailable"
    if rate >= 80: return 20.0, f"{rate:.0f}% growth — rapidly accelerating problem awareness"
    if rate >= 50: return 16.0, f"{rate:.0f}% growth — strong acceleration"
    if rate >= 20: return 12.0, f"{rate:.0f}% growth — growing awareness"
    if rate >= 0:  return  7.0, f"{rate:.0f}% growth — stable awareness"
    return 3.0, f"{rate:.0f}% — declining problem discussion"


def _live_emotion(intensity: Optional[float]) -> Tuple[float, str]:
    if intensity is None:
        return 10.0, "Emotional intensity unavailable"
    if intensity >= 80: return 20.0, f"Very high emotional intensity ({intensity:.0f}/100)"
    if intensity >= 60: return 16.0, f"High emotional intensity ({intensity:.0f}/100)"
    if intensity >= 40: return 12.0, f"Moderate intensity ({intensity:.0f}/100)"
    return 7.0, f"Low emotional intensity ({intensity:.0f}/100)"


def _live_intent(intent: Optional[float]) -> Tuple[float, str]:
    if intent is None:
        return 10.0, "Purchase intent unavailable"
    if intent >= 70: return 20.0, f"{intent:.0f}% purchase-intent discussion — strong buyer signal"
    if intent >= 50: return 16.0, f"{intent:.0f}% — good purchase intent"
    if intent >= 30: return 11.0, f"{intent:.0f}% — moderate intent"
    return 6.0, f"{intent:.0f}% — low purchase intent in discussion"


def _live_scarcity(scarcity: Optional[float]) -> Tuple[float, str]:
    if scarcity is None:
        return 5.0, "Solution scarcity unavailable"
    if scarcity >= 70: return 10.0, f"High solution scarcity ({scarcity:.0f}/100) — market gap confirmed"
    if scarcity >= 50: return  8.0, f"Moderate scarcity ({scarcity:.0f}/100)"
    if scarcity >= 30: return  5.0, f"Some scarcity ({scarcity:.0f}/100)"
    return 2.0, f"Low scarcity ({scarcity:.0f}/100) — existing solutions are adequate"


def _keyword(title: str) -> str:
    import re
    STOP = {"the","a","an","and","or","for","with","pack","set","piece","pcs","oz","lb","count","in","of","by","new"}
    words = re.sub(r"[^a-z\s]", "", title.lower()).split()
    return " ".join(w for w in words if w not in STOP and len(w) > 2)[:40]


def problem_frame(ctx: MarketContext) -> str:
    """Public helper for narrative generation."""
    return _CATEGORY_FRAMES.get(ctx.category_name.lower(),
                                 "Consumers seek solutions in this product category")
