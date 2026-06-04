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
from typing import Dict, Set
import importlib


@dataclass
class CategoryConfig:
    name:               str
    display_name:       str
    parent_cat_id:      int
    subcategories:      Dict[str, int]   # {label: keepa_node_id}
    excluded_brands:    Set[str]         # lowercase substrings; case-insensitive match
    min_bsr:            int   = 500
    max_bsr:            int   = 5000
    min_price:          float = 20.0
    min_monthly_sales:  int   = 300
    max_reviews:        int   = 200


# ── Registry ────────────────────────────────────────────────────────────────

_REGISTRY: Dict[str, str] = {
    "kitchen":     "categories.kitchen",
    "pet":         "categories.pet",
    "beauty":      "categories.beauty",
    "supplements": "categories.supplements",
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
