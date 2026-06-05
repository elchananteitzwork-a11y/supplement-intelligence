"""
TikTok trend source stub.

Future: TikTok Research API — hashtag volume, video count, engagement rate
for product-adjacent keywords → 0–100 virality signal.

To activate: replace this stub with a real implementation that calls the
TikTok Research API and returns a normalized 0–100 score.
"""

from typing import Optional


class TikTokStub:
    name = "tiktok"
    weight = 0.35
    is_available = False

    def get_score(self, keyword: str, category: str = "") -> Optional[float]:
        return None
