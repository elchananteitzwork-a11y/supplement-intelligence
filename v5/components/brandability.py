"""
Layer 7 — Brandability Score (15%) — REDESIGNED in V5.

V4 measured product line expansion (can I add SKUs?).
V5 measures identity architecture: can people become a version of themselves
through this brand?

"I'm an AG1 person." "I'm a Stanley person." "I'm on Bloom."

Sub-factors (total = 100):
  Lifestyle Identity (0–35):  Is this tied to an identity movement?
  Content Creation (0–25):    Can compelling 60-second content be made?
  Community Building (0–20):  Would users form communities around this?
  Subscription Viability (0–20): Can this be sold as a monthly subscription?
"""

import re
from typing import Any, Dict, Set, Tuple

from keepa.models import BSRAnalysis
from v3.models import ComponentScore, FactorDetail
from v5.components import MarketContext

WEIGHT = 0.15

# Lifestyle tiers (movement / identity / enthusiast / functional / commodity)
_MOVEMENT: Set[str] = {
    "gut", "sleep", "recovery", "immunity", "stress", "energy", "focus",
    "hydration", "detox", "cleanse", "hormone", "anti-aging", "longevity",
    "adaptogen", "nootropic", "inflammation", "metaboli", "probiotic",
    "collagen", "wellness", "women", "men", "hormone", "libido",
}
_IDENTITY: Set[str] = {
    "beauty", "skin", "skincare", "hair", "nail", "glow", "tone",
    "brighten", "firming", "anti-aging", "aging", "dog", "cat", "pet",
    "vitamin", "supplement", "protein",
}
_ENTHUSIAST: Set[str] = {
    "fitness", "workout", "gym", "sport", "outdoor", "hiking", "yoga",
    "cooking", "coffee", "tea", "nutrition",
}
_FUNCTIONAL: Set[str] = {
    "kitchen", "baking", "meal", "food", "storage", "organize",
}
_COMMODITY: Set[str] = {
    "cutting", "board", "press", "rack", "holder", "tray", "caddy",
    "mat", "mold", "ice", "cloth", "measuring", "utensil",
}


def score(product: Dict[str, Any], bsr: BSRAnalysis, ctx: MarketContext) -> ComponentScore:
    title = (product.get("title") or bsr.title or "").lower()

    f_lifestyle = _f_lifestyle_identity(title, ctx)
    f_content   = _f_content_creation(ctx.repeat_purchase_potential, f_lifestyle[0])
    f_community = _f_community(f_lifestyle[0])
    f_sub       = _f_subscription_viability(ctx.subscription_eligible, ctx.repeat_purchase_potential)

    raw = f_lifestyle[0] + f_content[0] + f_community[0] + f_sub[0]
    score_val = min(100.0, round(raw, 1))

    return ComponentScore(
        name="brandability",
        weight=WEIGHT,
        score=score_val,
        contribution=round(score_val * WEIGHT, 2),
        factors=[
            FactorDetail("lifestyle_identity",     35, f_lifestyle[0], f_lifestyle[1]),
            FactorDetail("content_creation",       25, f_content[0],   f_content[1]),
            FactorDetail("community_building",     20, f_community[0], f_community[1]),
            FactorDetail("subscription_viability", 20, f_sub[0],       f_sub[1]),
        ],
        confidence=65.0,
        data_sources=["category_config", "title_keywords"],
    )


def _f_lifestyle_identity(title: str, ctx: MarketContext) -> Tuple[float, str]:
    words = set(re.sub(r"[^a-z\s]", "", title).split())

    # Category name provides additional signal
    cat = ctx.category_name.lower()
    if cat == "supplements":
        words.update(["supplement", "wellness"])
    elif cat == "beauty":
        words.update(["beauty", "skin"])
    elif cat == "pet":
        words.update(["pet", "dog"])

    if words & _MOVEMENT:
        matched = list(words & _MOVEMENT)[:2]
        return 33.0, f"Movement-tier identity: {', '.join(matched)} — people define themselves through this"
    if words & _IDENTITY:
        matched = list(words & _IDENTITY)[:2]
        return 25.0, f"Identity-tier: {', '.join(matched)} — strong lifestyle association"
    if words & _ENTHUSIAST:
        matched = list(words & _ENTHUSIAST)[:2]
        return 17.0, f"Enthusiast-tier: {', '.join(matched)} — niche community identity"
    if words & _FUNCTIONAL:
        matched = list(words & _FUNCTIONAL)[:2]
        return 10.0, f"Functional product: {', '.join(matched)} — utility identity, limited aspiration"
    if words & _COMMODITY:
        matched = list(words & _COMMODITY)[:2]
        return 4.0, f"Commodity product: {', '.join(matched)} — minimal brand identity potential"
    return 12.0, "No strong identity tier detected — moderate brand potential"


def _f_content_creation(rpp: int, lifestyle_pts: float) -> Tuple[float, str]:
    """Transformation products + lifestyle identity = high content potential."""
    if rpp >= 70 and lifestyle_pts >= 25:
        return 23.0, "Before/after transformation potential — high TikTok/Instagram content ceiling"
    if rpp >= 50 or lifestyle_pts >= 20:
        return 17.0, "Good content creation potential — demonstrable benefit or lifestyle angle"
    if lifestyle_pts >= 12:
        return 12.0, "Moderate content potential — functional demo possible"
    return 6.0, "Limited content creation potential — commodity product"


def _f_community(lifestyle_pts: float) -> Tuple[float, str]:
    """Community forms around movements and identities, not commodities."""
    if lifestyle_pts >= 30:
        return 18.0, "Strong community potential — movement/identity category drives organic groups"
    if lifestyle_pts >= 20:
        return 14.0, "Good community potential — identity category supports engaged community"
    if lifestyle_pts >= 12:
        return  9.0, "Niche community possible — enthusiast tier"
    return  4.0, "Low community potential — commodity/functional product"


def _f_subscription_viability(sub_eligible: bool, rpp: int) -> Tuple[float, str]:
    if sub_eligible:
        return 18.0, "Monthly subscription model validated for this category"
    if rpp >= 60:
        return 11.0, f"High repeat purchase (rpp={rpp}/100) enables subscription-like retention"
    if rpp >= 30:
        return  7.0, f"Moderate repeat purchase (rpp={rpp}/100)"
    return  4.0, "One-time purchase — subscription unlikely"


def lifestyle_tier(score_val: float) -> str:
    """Public helper for narrative generation."""
    if score_val >= 30: return "MOVEMENT"
    if score_val >= 22: return "IDENTITY"
    if score_val >= 14: return "ENTHUSIAST"
    if score_val >= 8:  return "FUNCTIONAL"
    return "COMMODITY"
