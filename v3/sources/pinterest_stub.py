"""
Pinterest trend source stub.

Future: Pinterest API — monthly save counts and trend direction for
product-adjacent keywords → 0–100 aspirational demand signal.
Particularly relevant for home, beauty, kitchen, and lifestyle categories.

To activate: replace this stub with a real implementation that calls
the Pinterest Analytics API.
"""

from typing import Optional


class PinterestStub:
    name = "pinterest"
    weight = 0.10
    is_available = False

    def get_score(self, keyword: str, category: str = "") -> Optional[float]:
        return None
