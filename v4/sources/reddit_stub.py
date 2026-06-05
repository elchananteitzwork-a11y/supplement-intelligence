"""
Reddit signal source stub — V4 extended interface.

When live: use PRAW (Python Reddit API Wrapper) to search subreddits.

Dimensions this source provides when live:
  trend_score:       normalized post+comment volume (0–100)
  momentum_30d:      post count last 30d vs prior 30d (0–100)
  community_signal:  upvote ratio × comment depth score (0–100)
                     High = genuine discussion; Low = spam or bots
  purchase_intent:   % of posts mentioning "buy", "worth it", "recommend",
                     "where to find", "link?" (0–100)

Relevant subreddits by category:
  Kitchen:       r/Cooking, r/KitchenConfidential, r/MealPrepSunday
  Pet:           r/dogs, r/cats, r/Pets
  Supplements:   r/Fitness, r/Supplements, r/nutrition
  Beauty:        r/SkincareAddiction, r/MakeupAddiction

Anti-hype: Reddit is the hardest platform to fake organically.
High community_signal + purchase_intent = validated real-world demand.
"""

from typing import Optional
from v4.sources import TrendSignal


class RedditStub:
    name = "reddit"
    weight = 0.20
    is_available = False

    def get_signal(self, keyword: str, category: str = "") -> Optional[TrendSignal]:
        return None
