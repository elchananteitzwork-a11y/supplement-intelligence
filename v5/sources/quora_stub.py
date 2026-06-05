"""
Quora problem discovery stub.

When live: use Quora API or scraping to find questions in product categories.

Question patterns that indicate product opportunity:
  "What is the best [product] for [problem]?"
  "Why doesn't [solution] exist for [problem]?"
  "How do people deal with [problem]?"
  "Is there a [product] that [requirement]?"

Quora signal is particularly strong for:
  Health/Wellness: high question volume about symptoms and solutions
  Beauty:          skincare routine questions, ingredient research
  Pet:             health and behavior questions with no good answers

Metrics provided when live:
  mention_count:    questions containing problem patterns (all-time, with recency weight)
  growth_rate_30d:  new questions in last 30d vs prior 30d
  emotional_intensity: question view count as proxy for how many people relate
  purchase_intent:  % of top answers mentioning specific products
  solution_scarcity: % of questions with answers saying "there isn't a good solution"
"""

from typing import Optional
from v5.sources import ProblemSignal


class QuoraStub:
    name = "quora"
    is_available = False

    def get_signal(self, keyword: str, category: str = "") -> Optional[ProblemSignal]:
        return None
