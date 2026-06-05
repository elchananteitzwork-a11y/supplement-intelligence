"""
Layer 8 — Amazon Gap Score and Bonus Generator.

V5 bonus activation (external_acceleration):
  trend_velocity > amazon_opportunity AND trend_velocity > 55 AND not all_stubs

gap_score formula (informational, 0–100):
  √(external_signal × amazon_openness) × 100
  external_signal = (trend_velocity × authenticity / 100) / 100
  amazon_openness = amazon_opportunity / 100
"""

import math
from typing import Tuple

_TREND_THRESHOLD = 55.0   # trend must be above noise level
_TREND_VS_AMZ    = 0.0    # trend must strictly exceed amazon_opportunity


def compute(
    trend_velocity:     float,
    amazon_opportunity: float,
    authenticity_score: float,
    all_stubs:          bool,
) -> Tuple[float, float, str]:
    """
    Returns (gap_score, bonus, narrative).
    bonus = 10.0 if external trend outpaces Amazon capture, else 0.0.
    """
    ext  = (trend_velocity * authenticity_score / 100.0) / 100.0
    open_ = amazon_opportunity / 100.0
    gap   = round(math.sqrt(ext * open_) * 100, 1)

    if all_stubs:
        bonus = 0.0
        narrative = _stub_narrative(amazon_opportunity)
    elif (trend_velocity > amazon_opportunity + _TREND_VS_AMZ
          and trend_velocity >= _TREND_THRESHOLD):
        bonus = 10.0
        narrative = (
            f"External trend ({trend_velocity:.0f}/100) outpacing Amazon capture "
            f"({amazon_opportunity:.0f}/100) — early entry window confirmed. "
            f"Gap score: {gap:.0f}/100."
        )
    else:
        bonus = 0.0
        narrative = _no_bonus_narrative(trend_velocity, amazon_opportunity, gap, all_stubs)

    return gap, bonus, narrative


def _stub_narrative(amz: float) -> str:
    if amz >= 65:
        return (
            f"Amazon competition is low ({amz:.0f}/100). External signals not yet integrated. "
            "Connect Google Trends or TikTok to detect the entry window timing."
        )
    if amz >= 45:
        return f"Moderate Amazon competition ({amz:.0f}/100). Entry window exists but needs trend validation."
    return f"Amazon competition is already high ({amz:.0f}/100). Strong external trend needed to overcome saturation."


def _no_bonus_narrative(trend: float, amz: float, gap: float, stubs: bool) -> str:
    if trend <= amz:
        return (
            f"Amazon demand ({amz:.0f}) is keeping pace with external trend ({trend:.0f}). "
            "Amazon has already captured most of this momentum."
        )
    return (
        f"External trend signal ({trend:.0f}) is below the confirmation threshold. "
        f"Gap score: {gap:.0f}/100."
    )
