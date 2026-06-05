"""
Amazon Opportunity Gap — V4 new component.

Quantifies the gap between external trend acceleration and Amazon market capture.

High gap = strong external demand + weak Amazon competition = entry window is open.
The gap score is informational (0–100) and generates a binary +10 bonus.

Gap formula: √(external_signal × amazon_openness) × 100

This geometric mean means BOTH conditions must be strong simultaneously.
A strong trend in a saturated Amazon market = no gap (opportunity has passed).
An open Amazon market with no trend = no gap (nothing pulling demand).
"""

import math
from typing import Tuple


# Bonus activation thresholds
_TREND_MIN_FOR_BONUS   = 55.0   # external trend must be meaningful
_SAT_MIN_FOR_BONUS     = 45.0   # Amazon market must still be open
_TREND_VS_DEMAND_DELTA = 0.0    # trend must exceed demand (strict: no negative delta)


def compute(
    trend_velocity:     float,   # 0–100 (adjusted, from trend_intelligence)
    market_saturation:  float,   # 0–100 (higher = less saturated = more open)
    demand_score:       float,   # 0–100 (Amazon demand signal)
    authenticity_score: float,   # 0–100 (from anti-hype filter)
    all_stubs:          bool,
) -> Tuple[float, float, str]:
    """
    Returns (gap_score, bonus_points, narrative).

    gap_score:    0–100 informational score
    bonus_points: 0.0 or 10.0
    narrative:    one-sentence explanation of the gap
    """
    # External signal: trend velocity dampened by authenticity
    external_raw = (trend_velocity * authenticity_score / 100.0) / 100.0  # 0–1

    # Amazon openness (market_saturation is already "higher = more open")
    amz_open = market_saturation / 100.0  # 0–1

    gap_score = round(math.sqrt(external_raw * amz_open) * 100, 1)

    # Bonus: trend accelerating externally faster than Amazon has captured
    if all_stubs:
        bonus = 0.0
        narrative = _stub_narrative(market_saturation, demand_score)
    elif (
        trend_velocity > demand_score + _TREND_VS_DEMAND_DELTA
        and trend_velocity >= _TREND_MIN_FOR_BONUS
        and market_saturation >= _SAT_MIN_FOR_BONUS
    ):
        bonus = 10.0
        narrative = (
            f"External trend ({trend_velocity:.0f}) outpacing Amazon demand ({demand_score:.0f}) "
            f"in an open market ({market_saturation:.0f}/100 saturation) — "
            f"early entry window confirmed. Gap score: {gap_score:.0f}/100."
        )
    else:
        bonus = 0.0
        narrative = _no_bonus_narrative(trend_velocity, demand_score, market_saturation, gap_score)

    return gap_score, bonus, narrative


def _stub_narrative(market_saturation: float, demand_score: float) -> str:
    if market_saturation > 65:
        return (
            f"Amazon competition is low ({market_saturation:.0f}/100 saturation). "
            "External trend sources are not yet integrated — cannot confirm whether "
            "demand is accelerating outside Amazon. "
            "Connect Google Trends or TikTok to detect the entry window."
        )
    if market_saturation > 45:
        return (
            f"Moderate Amazon competition ({market_saturation:.0f}/100 saturation). "
            "Entry window may exist but requires external trend validation to confirm timing."
        )
    return (
        f"Amazon competition is already high ({market_saturation:.0f}/100 saturation). "
        "Even strong external trends may not create sufficient gap at this stage."
    )


def _no_bonus_narrative(
    trend_velocity: float,
    demand_score:   float,
    market_saturation: float,
    gap_score:      float,
) -> str:
    if trend_velocity <= demand_score:
        return (
            f"Amazon demand ({demand_score:.0f}) is keeping pace with or ahead of external trend "
            f"({trend_velocity:.0f}) — Amazon has already captured most of this opportunity."
        )
    if trend_velocity < _TREND_MIN_FOR_BONUS:
        return (
            f"External trend signal ({trend_velocity:.0f}) is below the threshold for "
            f"a confirmed entry window. Gap score: {gap_score:.0f}/100."
        )
    return (
        f"Amazon market is competitive ({market_saturation:.0f}/100 saturation) — "
        f"gap exists but entry window is narrowing. Gap score: {gap_score:.0f}/100."
    )
