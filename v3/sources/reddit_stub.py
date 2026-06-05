"""
Reddit signal source stub.

Future: Reddit API (PRAW) — post and comment volume for product keywords
on relevant subreddits → 0–100 community interest signal.

To activate: replace this stub with a real implementation that queries
subreddits like r/BuyItForLife, r/malelivingspace, r/DIY, etc.
"""

from typing import Optional


class RedditStub:
    name = "reddit"
    weight = 0.15
    is_available = False

    def get_score(self, keyword: str, category: str = "") -> Optional[float]:
        return None
