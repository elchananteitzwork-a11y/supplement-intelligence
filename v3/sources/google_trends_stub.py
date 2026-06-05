"""
Google Trends source stub.

Future: pytrends or SerpAPI — 12-month normalized search interest (0–100)
for the primary product keyword, calibrated against category baseline.

To activate: replace this stub with a real implementation that calls
the Google Trends API and returns a normalized 0–100 trend score.
"""

from typing import Optional


class GoogleTrendsStub:
    name = "google_trends"
    weight = 0.40
    is_available = False

    def get_score(self, keyword: str, category: str = "") -> Optional[float]:
        return None
