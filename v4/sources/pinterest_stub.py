"""
Pinterest trend source stub — V4 extended interface.

When live: use Pinterest API or Trends Tool.

Dimensions this source provides when live:
  trend_score:       normalized pin/save volume for product keyword (0–100)
  momentum_30d:      save growth last 30d vs prior 30d (0–100)
  stability_12m:     consistency of save activity over 12 months (0–100)

Pinterest signal is particularly strong for:
  Home & Kitchen, Beauty, Pet accessories, Wellness/supplements

The Pinterest signal precedes purchase: users save products they INTEND to buy.
High save volume + growing momentum = category is entering mainstream consumer desire.

Anti-hype: Pinterest users actively save things they want to buy.
Low engagement_ratio risk — saves imply genuine intent.
"""

from typing import Optional
from v4.sources import TrendSignal


class PinterestStub:
    name = "pinterest"
    weight = 0.10
    is_available = False

    def get_signal(self, keyword: str, category: str = "") -> Optional[TrendSignal]:
        return None
