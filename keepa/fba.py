"""
Amazon FBA fulfillment fee estimation (2024 non-apparel rate card).

Uses package dimensions (mm) and weight (g) from Keepa normalized data.
Dimensional weight is applied for large standard and oversize tiers.

Margin formula:
  net_margin = price × (1 - 0.15 referral - 0.30 COGS) - fba_fee
             = price × 0.55 - fba_fee

Both 0.15 and 0.30 are conservative assumptions for private-label.
"""

import math
from typing import Optional, Tuple

MM_TO_IN = 0.0393701
G_TO_OZ  = 0.035274
DIM_WEIGHT_DIVISOR = 139  # Amazon's standard divisor (cubic inches → lbs)

# Referral fee and COGS assumptions
REFERRAL_FEE_PCT = 0.15
COGS_PCT         = 0.30
MARGIN_MULTIPLIER = 1 - REFERRAL_FEE_PCT - COGS_PCT  # 0.55


def _to_inches(h_mm: float, w_mm: float, l_mm: float) -> Tuple[float, float, float]:
    """Convert mm → inches, sorted ascending (shortest, median, longest)."""
    dims = sorted([h_mm * MM_TO_IN, w_mm * MM_TO_IN, l_mm * MM_TO_IN])
    return dims[0], dims[1], dims[2]


def _dim_weight_oz(h_in: float, w_in: float, l_in: float) -> float:
    """Amazon dimensional weight: (L×W×H) / 139, converted to oz."""
    return (l_in * w_in * h_in / DIM_WEIGHT_DIVISOR) * 16


def classify_size_tier(
    height_mm: Optional[float],
    width_mm:  Optional[float],
    length_mm: Optional[float],
    weight_g:  Optional[float],
) -> str:
    """
    Classify a product into an Amazon FBA size tier.
    Returns 'unknown' if any dimension is missing.
    """
    if not all([height_mm, width_mm, length_mm, weight_g]):
        return "unknown"

    h, w, l = _to_inches(height_mm, width_mm, length_mm)
    actual_oz  = weight_g * G_TO_OZ
    girth      = 2 * (h + w)

    # Small standard: ≤ 15"×12"×0.75", ≤ 12 oz (no dim weight applied)
    if l <= 15 and w <= 12 and h <= 0.75 and actual_oz <= 12:
        return "small_standard"

    # Large standard: ≤ 18"×14"×8", ≤ 20 lb billable
    dim_oz    = _dim_weight_oz(h, w, l)
    bill_oz   = max(actual_oz, dim_oz)
    bill_lb   = bill_oz / 16
    if l <= 18 and w <= 14 and h <= 8 and bill_lb <= 20:
        return "large_standard"

    # Small oversize: ≤ 60"×30", ≤ 70 lb, L + girth ≤ 130"
    if l <= 60 and w <= 30 and bill_lb <= 70 and (l + girth) <= 130:
        return "small_oversize"

    # Medium oversize: longest ≤ 108", ≤ 150 lb, L + girth ≤ 165"
    if l <= 108 and bill_lb <= 150 and (l + girth) <= 165:
        return "medium_oversize"

    # Large oversize: longest ≤ 108", ≤ 150 lb
    if l <= 108 and bill_lb <= 150:
        return "large_oversize"

    return "special_oversize"


def estimate_fee(size_tier: str, weight_g: Optional[float],
                 height_mm: Optional[float] = None, width_mm: Optional[float] = None,
                 length_mm: Optional[float] = None) -> Optional[float]:
    """
    Estimate Amazon FBA fulfillment fee in USD.
    Uses billable weight (max of actual and dimensional) for large standard+.
    Returns None if size_tier is 'unknown'.
    """
    if size_tier == "unknown" or weight_g is None:
        return None

    actual_oz = weight_g * G_TO_OZ

    # Apply dimensional weight for large standard and oversize
    if size_tier != "small_standard" and all([height_mm, width_mm, length_mm]):
        h, w, l = _to_inches(height_mm, width_mm, length_mm)
        dim_oz  = _dim_weight_oz(h, w, l)
        oz      = max(actual_oz, dim_oz)
    else:
        oz = actual_oz

    lb = oz / 16

    if size_tier == "small_standard":
        if oz <= 2:   return 3.06
        if oz <= 4:   return 3.15
        if oz <= 6:   return 3.24
        if oz <= 8:   return 3.33
        if oz <= 10:  return 3.51
        return 3.58

    if size_tier == "large_standard":
        if oz <= 4:   return 3.86
        if oz <= 8:   return 4.08
        if oz <= 12:  return 4.24
        if oz <= 16:  return 4.75
        if oz <= 24:  return 5.40
        if oz <= 32:  return 5.69
        if oz <= 40:  return 6.10
        if oz <= 48:  return 6.39
        extra = math.ceil((oz - 48) / 8)
        return round(6.39 + 0.16 * extra, 2)

    if size_tier == "small_oversize":
        return round(8.26 + max(0.0, 0.38 * (lb - 1)), 2)

    if size_tier == "medium_oversize":
        return round(11.37 + max(0.0, 0.39 * (lb - 2)), 2)

    if size_tier == "large_oversize":
        return round(75.78 + max(0.0, 0.79 * (lb - 90)), 2)

    return round(137.32 + max(0.0, 0.91 * (lb - 90)), 2)


def net_margin_pct(price: float, fba_fee: float) -> float:
    """
    Estimated net margin %.
    Assumes 15% referral fee and 30% COGS (private-label conservative baseline).
    """
    if price <= 0:
        return 0.0
    return round((price * MARGIN_MULTIPLIER - fba_fee) / price * 100, 1)


def score_margin(
    price:     Optional[float],
    height_mm: Optional[float],
    width_mm:  Optional[float],
    length_mm: Optional[float],
    weight_g:  Optional[float],
    weight:    int = 15,
) -> Tuple[float, str, Optional[float], str]:
    """
    Score FBA margin on a 0–{weight} scale.
    Returns (score, rationale, estimated_fba_fee, size_tier).
    """
    tier    = classify_size_tier(height_mm, width_mm, length_mm, weight_g)
    fee     = estimate_fee(tier, weight_g, height_mm, width_mm, length_mm)
    pct     = net_margin_pct(price, fee) if (price and fee) else None

    if pct is not None:
        label = f"${price:.2f} price / ${fee:.2f} FBA fee / ~{pct:.0f}% net margin"
        if pct >= 30: return weight,       label + " — excellent",  fee, tier
        if pct >= 20: return weight * 0.8, label + " — good",       fee, tier
        if pct >= 12: return weight * 0.55, label + " — adequate",  fee, tier
        if pct >= 5:  return weight * 0.27, label + " — tight",     fee, tier
        if pct >= 0:  return 1,             label + " — barely viable", fee, tier
        return 0, label + " — NEGATIVE MARGIN", fee, tier

    # No dimension data — fall back to price heuristic (capped at 60% of weight)
    cap = round(weight * 0.6)
    if not price:
        return 0, "No price data", None, tier
    if price >= 35: return cap,           f"${price:.2f} — good price (dims unavailable)", None, tier
    if price >= 25: return round(cap*0.75), f"${price:.2f} — adequate price (dims unavailable)", None, tier
    if price >= 20: return round(cap*0.55), f"${price:.2f} — tight margin (dims unavailable)", None, tier
    if price >= 15: return round(cap*0.35), f"${price:.2f} — very tight (dims unavailable)", None, tier
    if price >= 10: return 1,             f"${price:.2f} — minimal margin (dims unavailable)", None, tier
    return 0, f"${price:.2f} — insufficient for FBA (dims unavailable)", None, tier
