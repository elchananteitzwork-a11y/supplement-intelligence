"""
Google Trends source stub — V4 extended interface.

When live: use pytrends or SerpAPI to fetch 12-month interest over time.

Dimensions this source provides when live:
  trend_score:       normalized 0–100 interest level
  momentum_30d:      (avg_last_30d - avg_prior_30d) / avg_prior_30d × 100, clipped 0–100
  momentum_90d:      same, 90-day window
  stability_12m:     1 - (std_dev / mean) of 12m series, clipped 0–100
  search_correlation: 100 (search IS the signal — always correlated with itself)
  purchase_intent:   % of related queries containing buying-intent keywords
                     ("buy", "cheap", "best", "review", "where to buy")

Anti-hype: Google Trends always has high search_correlation (100) and is immune
to single-creator distortion — it measures aggregate search behavior.
"""

from typing import Optional
from v4.sources import TrendSignal


class GoogleTrendsStub:
    name = "google_trends"
    weight = 0.30
    is_available = False

    def get_signal(self, keyword: str, category: str = "") -> Optional[TrendSignal]:
        return None
