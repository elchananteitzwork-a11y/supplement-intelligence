"""
Pluggable trend data source protocol for V3 Trend Velocity component.

To add a live source:
1. Create v3/sources/my_source.py implementing TrendDataSource
2. Set is_available = True
3. Pass an instance to v3.engine.run(trend_sources=[...])

No other files need changing.
"""

from typing import Optional, Protocol, runtime_checkable


@runtime_checkable
class TrendDataSource(Protocol):
    """
    Each source returns a 0–100 normalized trend score per keyword.
    Stubs return None (excluded from weighted average).
    """

    @property
    def name(self) -> str: ...

    @property
    def weight(self) -> float:
        """Default contribution weight (0.0–1.0)."""
        ...

    @property
    def is_available(self) -> bool:
        """False for stubs. True only when real credentials are configured."""
        ...

    def get_score(self, keyword: str, category: str = "") -> Optional[float]:
        """Return 0–100 trend score, or None if unavailable."""
        ...
