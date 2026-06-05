"""
V5 source protocols.

Two source types:
  ProblemDataSource  — scans for consumer problem signals (Layer 1)
  TrendDataSourceV4  — trend signals (Layers 2+3) — reused from V4

Problem sources detect the raw consumer pain that precedes product demand.
They answer: "What are people actively complaining about / wishing existed?"
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable


@dataclass
class ProblemSignal:
    """
    Multi-dimensional consumer problem signal from a single source.
    All optional fields are None when the source is a stub.
    """
    source_name:    str
    keyword:        str

    # Volume
    mention_count:    Optional[int]    # raw discussion volume
    growth_rate_30d:  Optional[float]  # 0–100: discussion growth last 30d

    # Quality
    emotional_intensity: Optional[float]  # 0–100: extremity of sentiment
    purchase_intent:     Optional[float]  # 0–100: buying-language %
    solution_scarcity:   Optional[float]  # 0–100: poor existing solution rating

    # Pattern examples (for narrative generation)
    top_patterns: List[str] = field(default_factory=list)

    confidence: float = 0.0
    is_stub:    bool  = True
    raw:        Dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class ProblemDataSource(Protocol):
    """
    Protocol for problem discovery data source adapters.

    To activate:
      1. Create v5/sources/my_source.py implementing ProblemDataSource
      2. Set is_available = True
      3. Pass to v5.engine.run(problem_sources=[MySource(), ...])
    """

    @property
    def name(self) -> str: ...

    @property
    def is_available(self) -> bool: ...

    def get_signal(self, keyword: str, category: str = "") -> Optional[ProblemSignal]: ...
