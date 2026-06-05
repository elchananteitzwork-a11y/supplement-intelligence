"""
Etsy trend source stub — V4 new source (not present in V3).

When live: use Etsy Open API v3 to analyze listing counts and favorites.

Dimensions this source provides when live:
  trend_score:       normalized active listing count for keyword (0–100)
  momentum_30d:      new listing creation rate last 30d vs prior 30d (0–100)
  purchase_intent:   % of listings with confirmed sales (favorites ÷ active listings)
  community_signal:  review velocity on top Etsy listings (reviews/month)

WHY ETSY IS A LEADING INDICATOR:

Products selling well on Etsy are at the "artisan stage" of the product lifecycle:
  Stage 1: Artisan creates handmade version → Etsy traction
  Stage 2: Small brands discover demand → early Amazon listings
  Stage 3: Private label enters → Amazon competition builds
  Stage 4: Commoditized → race to bottom

V4 targets Stage 1–2 products: Etsy trending = Stage 1 signal.
Etsy trending + weak Amazon competition = Stage 1–2 boundary = prime entry window.

Example historical patterns:
  - Silicone baking mats: Etsy → Amazon → commoditized
  - Dog slow feeder bowls: Etsy artisan → Amazon PL opportunity
  - Mushroom supplements: Etsy herbal → Amazon mass market
"""

from typing import Optional
from v4.sources import TrendSignal


class EtsyStub:
    name = "etsy"
    weight = 0.10
    is_available = False

    def get_signal(self, keyword: str, category: str = "") -> Optional[TrendSignal]:
        return None
