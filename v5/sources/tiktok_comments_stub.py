"""
TikTok comments problem discovery stub.

When live: use TikTok Research API to analyze comments on product-adjacent videos.

This source is distinct from the TikTok TREND source (which measures video volume).
This source reads COMMENTS to find consumer problem expressions.

Comment patterns that indicate unmet demand:
  "Where can I find this?"
  "Does anyone know a brand that does this?"
  "I've been looking for this forever"
  "I need this in my life"
  "This is exactly what I was looking for"
  "Why is it so hard to find..."

These comment patterns appear BEFORE a product is available — they signal
demand that has not yet been captured by Amazon sellers.

Metrics provided when live:
  mention_count:    comments matching problem-pattern templates
  growth_rate_30d:  growth in problem-pattern comments
  emotional_intensity: like-to-view ratio on problem-pattern comments (high = many agree)
  purchase_intent:  % of problem comments that include buying-intent language
  top_patterns:     most common exact phrases (for narrative generation)
"""

from typing import Optional
from v5.sources import ProblemSignal


class TikTokCommentsStub:
    name = "tiktok_comments"
    is_available = False

    def get_signal(self, keyword: str, category: str = "") -> Optional[ProblemSignal]:
        return None
