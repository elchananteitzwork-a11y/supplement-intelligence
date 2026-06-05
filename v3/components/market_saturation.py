"""
Component 5 — Market Saturation Score (10% of Final Opportunity Score).

Higher score = LESS saturated = better opportunity for a new entrant.
(Note the inversion: high score is good here, same convention as all components.)

Penalizes:
  - Many competing sellers
  - Concentrated brand ownership
  - Amazon holding the Buy Box
  - Price compression (race-to-the-bottom signaling)
"""

from typing import Any, Dict, Optional, Tuple

from keepa.models import BSRAnalysis, PriceAnalysis
from v3.components import MarketContext
from v3.models import ComponentScore, FactorDetail

WEIGHT = 0.10


def score(
    product:        Dict[str, Any],
    bsr:            BSRAnalysis,
    ctx:            MarketContext,
    price_analysis: PriceAnalysis,
) -> ComponentScore:
    current     = product.get("current", {})
    offer_count = current.get("offer_count")

    f_sellers  = _f_seller_count(offer_count)
    f_brands   = _f_brand_concentration(ctx.unique_brand_ratio)
    f_amazon   = _f_amazon_presence(ctx.amazon_bb_pct)
    f_price_sp = _f_price_spread(ctx.price_band_usd, ctx.price_compressed)

    raw = f_sellers[0] + f_brands[0] + f_amazon[0] + f_price_sp[0]
    score_val = min(100.0, round(raw, 1))

    conf = _confidence(offer_count, ctx.amazon_bb_pct, ctx.price_band_usd)

    return ComponentScore(
        name="market_saturation",
        weight=WEIGHT,
        score=score_val,
        contribution=round(score_val * WEIGHT, 2),
        factors=[
            FactorDetail("seller_count",       25, f_sellers[0],  f_sellers[1]),
            FactorDetail("brand_concentration", 25, f_brands[0],   f_brands[1]),
            FactorDetail("amazon_presence",     25, f_amazon[0],   f_amazon[1]),
            FactorDetail("price_spread",        25, f_price_sp[0], f_price_sp[1]),
        ],
        confidence=conf,
        data_sources=["keepa"],
    )


def _f_seller_count(offer_count: Optional[int]) -> Tuple[float, str]:
    if offer_count is None:
        return 12.0, "No offer count data — neutral assumption"
    note = f"{offer_count} seller(s) on this listing"
    if offer_count <= 2:  return 25.0, note + " — very few competitors"
    if offer_count <= 5:  return 20.0, note + " — light competition"
    if offer_count <= 10: return 14.0, note + " — moderate competition"
    if offer_count <= 20: return  8.0, note + " — crowded listing"
    return 3.0, note + " — heavily crowded"


def _f_brand_concentration(unique_brand_ratio: float) -> Tuple[float, str]:
    """
    Unique brands / total products in scan.
    High ratio = diverse brands = no dominant player = more opportunity.
    """
    note = f"{unique_brand_ratio:.2f} unique brand ratio"
    if unique_brand_ratio >= 0.8: return 25.0, note + " — highly fragmented market"
    if unique_brand_ratio >= 0.6: return 20.0, note + " — competitive but diverse"
    if unique_brand_ratio >= 0.4: return 14.0, note + " — moderate concentration"
    if unique_brand_ratio >= 0.2: return  8.0, note + " — concentrated market"
    return 3.0, note + " — dominated by few brands"


def _f_amazon_presence(amazon_bb_pct: Optional[float]) -> Tuple[float, str]:
    """Amazon holding the Buy Box = hard to win the listing."""
    if amazon_bb_pct is None:
        return 13.0, "Buy Box data unavailable — neutral assumption"
    note = f"Amazon holds Buy Box {amazon_bb_pct:.0f}% of the time"
    if amazon_bb_pct < 10:  return 25.0, note + " — Amazon barely present"
    if amazon_bb_pct < 30:  return 20.0, note + " — moderate Amazon presence"
    if amazon_bb_pct < 50:  return 13.0, note + " — Amazon competes actively"
    if amazon_bb_pct < 70:  return  6.0, note + " — Amazon dominant"
    return 0.0, note + " — Amazon locked — very hard to compete"


def _f_price_spread(price_band: Optional[float], compressed: bool) -> Tuple[float, str]:
    """Wide price band = sellers can differentiate on quality and price."""
    if price_band is None:
        return 13.0, "No price band data — neutral assumption"
    if compressed:
        return 3.0, f"${price_band:.2f} band — race-to-the-bottom price compression"
    if price_band < 2:    return  3.0, f"${price_band:.2f} band — extremely tight"
    if price_band < 5:    return  8.0, f"${price_band:.2f} band — narrow spread"
    if price_band < 10:   return 14.0, f"${price_band:.2f} band — moderate spread"
    if price_band < 20:   return 20.0, f"${price_band:.2f} band — healthy spread"
    return 25.0, f"${price_band:.2f} band — wide price differentiation possible"


def _confidence(
    offer_count: Optional[int],
    amazon_bb:   Optional[float],
    price_band:  Optional[float],
) -> float:
    available = sum(x is not None for x in [offer_count, amazon_bb, price_band])
    if available == 3:
        return 75.0
    if available == 2:
        return 55.0
    if available == 1:
        return 35.0
    return 20.0
