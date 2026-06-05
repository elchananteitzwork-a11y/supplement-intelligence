"""
categories — per-category configuration for the discovery engine.

Each registered category defines the Keepa parent node, subcategory catalog,
excluded brands, BSR window, price floor, and sales/review thresholds that
are appropriate for that market.  The discovery engine code is unchanged;
only these configuration values differ across categories.

Usage
-----
    from categories import load, activate

    config = load("kitchen")   # load a CategoryConfig by short name
    activate(config)            # inject brands into keepa.discovery at runtime

    # Then call run_discovery() with config values:
    run_discovery(
        niche=config.name,
        parent_cat_id=config.parent_cat_id,
        subcategory_ids=config.subcategories,
        min_bsr=config.min_bsr,
        ...
    )
"""

from dataclasses import dataclass, field
from typing import Dict, Optional, Set
import importlib


@dataclass
class CategoryConfig:
    name:               str
    display_name:       str
    parent_cat_id:      int
    subcategories:      Dict[str, int]   # {label: keepa_node_id}
    excluded_brands:    Set[str]         # lowercase substrings; case-insensitive match
    min_bsr:            int            = 500
    max_bsr:            int            = 50_000
    min_price:          float          = 20.0
    min_monthly_sales:  int            = 150
    max_reviews:        Optional[int]  = None   # None = no review-count gate
    expansion_potential:       int  = 50    # 0–100 brand-building upside for V3/V4
    repeat_purchase_potential: int  = 50    # 0–100 consumable/reorder likelihood for V5
    subscription_eligible:     bool = False # True if monthly subscription model viable


# ── Registry ────────────────────────────────────────────────────────────────

_REGISTRY: Dict[str, str] = {
    "kitchen":       "categories.kitchen",
    "pet":           "categories.pet",
    "beauty":        "categories.beauty",
    "supplements":   "categories.supplements",
    # Brand-first supplement categories (no review-count gate)
    "gut_health":    "categories.gut_health",
    "sleep":         "categories.sleep",
    "collagen":      "categories.collagen",
    "protein":       "categories.protein",
    "womens_health": "categories.womens_health",
    # Cross-category validation set
    "candles":           "categories.candles",
    "yoga_mats":         "categories.yoga_mats",
    "resistance_bands":  "categories.resistance_bands",
    "teeth_whitening":   "categories.teeth_whitening",
    "dog_treats":        "categories.dog_treats",
    "ice_cube_molds":    "categories.ice_cube_molds",
    "reusable_straws":   "categories.reusable_straws",
    "cooking_utensils":  "categories.cooking_utensils",
    "dog_kennels":       "categories.dog_kennels",
    "potholders":        "categories.potholders",
}


def load(name: str) -> CategoryConfig:
    """Return the CategoryConfig for the given short name."""
    key = name.lower().strip()
    if key not in _REGISTRY:
        raise ValueError(
            f"Unknown category '{name}'.  "
            f"Available: {available()}.  "
            f"For a custom niche, use --category-id with explicit --min-bsr / --max-bsr."
        )
    mod = importlib.import_module(_REGISTRY[key])
    return mod.CONFIG


def activate(config: CategoryConfig) -> None:
    """
    Inject category-specific excluded brands into keepa.discovery.EXCLUDED_BRANDS.

    EXCLUDED_BRANDS is a module-level mutable set; clearing and updating it
    here means the discovery agent uses the correct brand exclusions for the
    active category without any changes to the agent code.
    """
    import keepa.discovery as _kd
    _kd.EXCLUDED_BRANDS.clear()
    _kd.EXCLUDED_BRANDS.update(config.excluded_brands)


def is_known(name: str) -> bool:
    """Return True if name matches a registered category short name."""
    return name.lower().strip() in _REGISTRY


def available() -> str:
    """Comma-separated list of registered category names."""
    return ", ".join(sorted(_REGISTRY))
