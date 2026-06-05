"""
Reddit problem discovery stub.

When live: use PRAW to search relevant subreddits for problem-signal phrases.

Search patterns:
  "I wish there was..."
  "I'm looking for a..."
  "Does anyone know a..."
  "I'm struggling with..."
  "I hate that [product category]..."
  "I need a better..."
  "Why doesn't [product] exist that..."

Relevant subreddits by category:
  Supplements: r/Supplements, r/Fitness, r/nutrition, r/Nootropics, r/GutHealth
  Beauty:      r/SkincareAddiction, r/MakeupAddiction, r/HaircareScience
  Pet:         r/dogs, r/cats, r/Pets, r/DogCare
  Kitchen:     r/Cooking, r/MealPrepSunday, r/KitchenConfidential

Metrics provided when live:
  mention_count:    posts + comments containing problem keywords (30-day)
  growth_rate_30d:  (current_30d - prior_30d) / prior_30d × 100
  emotional_intensity: avg upvote ratio on problem posts (high upvotes = many agree)
  purchase_intent:  % of posts that include "buy", "recommend", "brand", "link"
  solution_scarcity: % of posts where top comment says "I couldn't find one either"
"""

from typing import Optional
from v5.sources import ProblemSignal


class RedditProblemStub:
    name = "reddit_problems"
    is_available = False

    def get_signal(self, keyword: str, category: str = "") -> Optional[ProblemSignal]:
        return None
