"""
V4 Trend Data Source protocol and TrendSignal model.

V3's TrendDataSource returned Optional[float] — a single number.
V4's TrendDataSourceV4 returns TrendSignal — a rich multi-dimensional object.
The extra dimensions power the Anti-Hype Filter and Opportunity Gap score.

Backward-compatible: V3 stubs can coexist with V4 sources.
V4 components only use V4 sources that return TrendSignal.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable


@dataclass
class TrendSignal:
    """
    Multi-dimensional trend signal from a single source.
    Fields that a source cannot provide should be None — they are excluded
    from anti-hype calculations rather than penalized.
    """
    source_name: str
    keyword:     str

    # Primary score (0–100)
    trend_score: float

    # Momentum dimensions
    momentum_30d:  Optional[float]   # 30-day acceleration (0=falling, 100=accelerating)
    momentum_90d:  Optional[float]   # 90-day trend (0=falling, 100=rising)
    stability_12m: Optional[float]   # 12-month stability (0=volatile, 100=stable)

    # Anti-hype signals — None means "source cannot provide this metric"
    engagement_ratio:    Optional[float]  # (likes+comments)/views × 100 (%)
    creator_diversity:   Optional[float]  # 0=single creator, 100=many independent creators
    search_correlation:  Optional[float]  # correlation with Google Search (0–100)
    community_signal:    Optional[float]  # organic discussion volume (0–100)

    # Intent signal
    purchase_intent:     Optional[float]  # 0=entertainment only, 100=buying intent

    # Meta
    confidence:  float  # 0–100 (data quality)
    is_stub:     bool   # True = no real data, all scores are None
    raw_metrics: Dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class TrendDataSourceV4(Protocol):
    """
    Protocol for V4 trend data source adapters.

    Implement get_signal() to return a TrendSignal with as many dimensions
    as your source can provide.  Leave unknown fields as None.

    To activate a source:
      1. Create v4/sources/my_source.py implementing this protocol
      2. Set is_available = True
      3. Pass to v4.engine.run(trend_sources=[MySource(), ...])
    """

    @property
    def name(self) -> str: ...

    @property
    def weight(self) -> float:
        """Contribution weight in weighted average (0.0–1.0)."""
        ...

    @property
    def is_available(self) -> bool:
        """False for stubs. True only when real data can be returned."""
        ...

    def get_signal(self, keyword: str, category: str = "") -> Optional[TrendSignal]: ...
