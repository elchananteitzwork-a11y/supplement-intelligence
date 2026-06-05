"""
Layer 6 — Repeat Purchase Score (15%) — NEW in V5.

The structurally most important new signal.
AG1, Seed, Bloom, and Liquid I.V. are not billion-dollar brands because of
their first purchase. They're billion-dollar brands because of their 24th.

Sub-factors (total = 100):
  Category Baseline (0–50):   CategoryConfig.repeat_purchase_potential × 0.50
  Product Type Signal (0–30): keyword detection from product title
  Subscription Viability (0–20): subscription_eligible + rpp threshold
"""

import re
from typing import Any, Dict, Set, Tuple

from keepa.models import BSRAnalysis
from v3.models import ComponentScore, FactorDetail
from v5.components import MarketContext

WEIGHT = 0.15

# Keyword tiers for product type signal
_VERY_HIGH: Set[str] = {
    "collagen", "probiotic", "protein", "vitamin", "supplement", "capsule",
    "powder", "tablet", "gummy", "gummies", "serum", "moisturizer", "cream",
    "lotion", "oil", "gel", "toner", "sunscreen", "retinol", "niacinamide",
    "treat", "chew", "chews", "kibble", "food", "refill", "replacement",
    "cartridge", "sachet", "bag", "pods",
}
_HIGH: Set[str] = {
    "beauty", "wellness", "health", "shampoo", "conditioner", "spray",
    "mask", "mist", "essence", "balm", "scrub", "exfoliant", "cleanser",
    "wash", "rinse", "drops",
}
_MEDIUM: Set[str] = {
    "brush", "pad", "filter", "cartridge", "refillable", "sponge",
}
_LOW: Set[str] = {
    "board", "press", "rack", "holder", "tray", "caddy", "mat", "mold",
    "ice", "cloth", "measuring", "utensil", "spatula", "ladle", "peeler",
}


def score(product: Dict[str, Any], bsr: BSRAnalysis, ctx: MarketContext) -> ComponentScore:
    title = (product.get("title") or bsr.title or "").lower()

    f_cat  = _f_category_baseline(ctx.repeat_purchase_potential)
    f_type = _f_product_type(title)
    f_sub  = _f_subscription(ctx.subscription_eligible, ctx.repeat_purchase_potential)

    raw = f_cat[0] + f_type[0] + f_sub[0]
    score_val = min(100.0, round(raw, 1))

    return ComponentScore(
        name="repeat_purchase",
        weight=WEIGHT,
        score=score_val,
        contribution=round(score_val * WEIGHT, 2),
        factors=[
            FactorDetail("category_baseline",   50, f_cat[0],  f_cat[1]),
            FactorDetail("product_type_signal", 30, f_type[0], f_type[1]),
            FactorDetail("subscription_viability", 20, f_sub[0], f_sub[1]),
        ],
        confidence=75.0,
        data_sources=["category_config", "title_keywords"],
    )


def _f_category_baseline(rpp: int) -> Tuple[float, str]:
    pts = round(rpp * 0.50, 1)
    return pts, f"Category repeat-purchase potential: {rpp}/100 → {pts:.1f}/50 pts"


def _f_product_type(title: str) -> Tuple[float, str]:
    words = set(re.sub(r"[^a-z\s]", "", title).split())
    if words & _VERY_HIGH:
        matched = list(words & _VERY_HIGH)[:2]
        return 28.0, f"Strong consumable keywords: {', '.join(matched)}"
    if words & _HIGH:
        matched = list(words & _HIGH)[:2]
        return 20.0, f"Repeat-use product keywords: {', '.join(matched)}"
    if words & _MEDIUM:
        matched = list(words & _MEDIUM)[:2]
        return 13.0, f"Moderate repeat-use signal: {', '.join(matched)}"
    if words & _LOW:
        matched = list(words & _LOW)[:2]
        return 5.0, f"One-time purchase indicators: {', '.join(matched)}"
    return 11.0, "No strong repeat-purchase keywords detected — moderate baseline"


def _f_subscription(sub_eligible: bool, rpp: int) -> Tuple[float, str]:
    if sub_eligible:
        return 18.0, "Subscription model viable — monthly reorder pattern confirmed for category"
    if rpp >= 60:
        return 12.0, f"Not flagged subscription-eligible but rpp={rpp}/100 — repeat likely without formal sub"
    if rpp >= 30:
        return 7.0, f"Occasional repeat purchase possible (rpp={rpp}/100)"
    return 4.0, f"One-time purchase category (rpp={rpp}/100) — low lifetime value"
