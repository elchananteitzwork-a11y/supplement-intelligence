"""
Anti-Hype Filter — V4 helper module.

Computes trend_authenticity_score (0–100) from TrendSignal dimensions.
Called by trend_intelligence.py before velocity aggregation.

A score of 100 = fully authenticated, no manipulation signals.
A score below 40 = likely fake or manufactured trend.

The dampening formula: adjusted_velocity = raw_velocity × (0.5 + auth/200)
  auth=100 → factor=1.00 (no dampening — fully trusted)
  auth= 50 → factor=0.75 (25% dampening — uncertain)
  auth= 20 → factor=0.60 (40% dampening — likely fake)
  auth=  0 → factor=0.50 (50% dampening — maximum skepticism)
"""

from typing import List, Optional, Tuple

from v4.sources import TrendSignal


# ── Thresholds ────────────────────────────────────────────────────────────────

_ENGAGEMENT_VANITY_MAX  = 1.0    # < 1% engagement ratio = vanity metric
_ENGAGEMENT_STRONG_MIN  = 3.0    # > 3% = genuinely engaged audience
_DIVERSITY_SINGLE_MAX   = 20.0   # < 20 = dominated by 1–2 creators
_DIVERSITY_ORGANIC_MIN  = 60.0   # > 60 = widespread organic spread
_SEARCH_CORR_LOW        = 20.0   # < 20 = viral without purchase intent
_SEARCH_CORR_HIGH       = 60.0   # > 60 = search validates social signal
_COMMUNITY_PRESENT_MIN  = 30.0   # > 30 = meaningful community discussion


def compute_authenticity(
    signals: List[TrendSignal],
) -> Tuple[float, str, List[str]]:
    """
    Returns (authenticity_score, summary_rationale, flag_list).

    flag_list contains human-readable warnings for any triggered penalties.
    When all signals are stubs, returns (50, neutral_note, []).
    """
    live = [s for s in signals if not s.is_stub]
    if not live:
        return 50.0, "Cannot verify — all trend sources are stubs", []

    base   = 70.0
    adjust = 0.0
    flags: List[str] = []

    # ── Engagement Ratio ─────────────────────────────────────────────────────
    ratios = [s.engagement_ratio for s in live if s.engagement_ratio is not None]
    if ratios:
        avg_ratio = sum(ratios) / len(ratios)
        if avg_ratio < _ENGAGEMENT_VANITY_MAX:
            adjust -= 25.0
            flags.append(
                f"LOW ENGAGEMENT: {avg_ratio:.1f}% avg engagement ratio "
                f"(< {_ENGAGEMENT_VANITY_MAX}% = vanity metric)"
            )
        elif avg_ratio > _ENGAGEMENT_STRONG_MIN:
            adjust += 10.0

    # ── Creator Diversity ────────────────────────────────────────────────────
    diversities = [s.creator_diversity for s in live if s.creator_diversity is not None]
    if diversities:
        avg_div = sum(diversities) / len(diversities)
        if avg_div < _DIVERSITY_SINGLE_MAX:
            adjust -= 30.0
            flags.append(
                f"SINGLE-CREATOR RISK: {avg_div:.0f}/100 creator diversity "
                f"(< {_DIVERSITY_SINGLE_MAX} = manufactured viral)"
            )
        elif avg_div > _DIVERSITY_ORGANIC_MIN:
            adjust += 10.0

    # ── Search Correlation ───────────────────────────────────────────────────
    correlations = [s.search_correlation for s in live if s.search_correlation is not None]
    if correlations:
        avg_corr = sum(correlations) / len(correlations)
        if avg_corr < _SEARCH_CORR_LOW:
            adjust -= 20.0
            flags.append(
                f"NO SEARCH INTENT: {avg_corr:.0f}/100 search correlation "
                f"(< {_SEARCH_CORR_LOW} = social virality without purchase intent)"
            )
        elif avg_corr > _SEARCH_CORR_HIGH:
            adjust += 10.0

    # ── Community Discussion ─────────────────────────────────────────────────
    community = [s.community_signal for s in live if s.community_signal is not None]
    if community:
        avg_comm = sum(community) / len(community)
        if avg_comm < _COMMUNITY_PRESENT_MIN:
            adjust -= 10.0
            flags.append(
                f"ABSENT COMMUNITY: {avg_comm:.0f}/100 community signal "
                f"(organic discussion missing — unvalidated by real buyers)"
            )
        elif avg_comm >= _COMMUNITY_PRESENT_MIN:
            adjust += 10.0

    score = max(0.0, min(100.0, round(base + adjust, 1)))

    if score >= 80:
        summary = f"Authentic trend ({score:.0f}/100) — {len(live)} source(s) validated"
    elif score >= 55:
        summary = f"Mostly authentic ({score:.0f}/100) — minor concerns"
    elif score >= 35:
        summary = f"Questionable trend ({score:.0f}/100) — {len(flags)} concern(s) detected"
    else:
        summary = f"Likely fake trend ({score:.0f}/100) — {len(flags)} manipulation signal(s)"

    return score, summary, flags


def dampen_factor(authenticity_score: float) -> float:
    """
    Convert authenticity score to a velocity dampening factor.
    Range: 0.50 (completely fake) to 1.00 (fully verified).
    """
    return 0.5 + (authenticity_score / 200.0)
