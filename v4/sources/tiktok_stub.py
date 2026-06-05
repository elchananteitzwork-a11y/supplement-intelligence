"""
TikTok trend source stub — V4 extended interface.

When live: use TikTok Research API or third-party scraper.

Dimensions this source provides when live:
  trend_score:       normalized hashtag + video volume (0–100)
  momentum_30d:      video count growth last 30d vs prior 30d (0–100)
  momentum_90d:      same, 90-day window
  engagement_ratio:  (avg_likes + avg_comments) / avg_views × 100 (%)
                     Threshold: < 1% = vanity, > 3% = high engagement
  creator_diversity: unique_creator_count / sqrt(total_video_count) normalized 0–100
                     Low = one creator's viral; High = organic product trend
  search_correlation: correlation coeff with Google Trends for same keyword (0–100)
  purchase_intent:   % of top-comment themes including buying intent signals

Anti-hype: TikTok is the most vulnerable to single-creator fake virality.
           The creator_diversity and engagement_ratio signals are critical here.
"""

from typing import Optional
from v4.sources import TrendSignal


class TikTokStub:
    name = "tiktok"
    weight = 0.30
    is_available = False

    def get_signal(self, keyword: str, category: str = "") -> Optional[TrendSignal]:
        return None
