"""
Disk-based cache for Keepa API responses.

Why cache:
  - Keepa charges tokens per API call. Caching prevents re-fetching the same
    niche during the same analysis session or within 24 hours.
  - Development and testing: re-run analysis scripts without burning tokens.

Cache location: keepa_cache/{slug}_{YYYY-MM-DD}.json
TTL: 24 hours (configurable via KEEPA_CACHE_TTL_HOURS env var).

The cache stores normalized product dicts, not raw Keepa responses.
Raw responses from Keepa are normalized immediately and the raw form is discarded.
"""

import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


CACHE_DIR = Path("keepa_cache")
DEFAULT_TTL_HOURS = int(os.environ.get("KEEPA_CACHE_TTL_HOURS", "24"))


def _cache_key(niche: str, category_id: Optional[int]) -> str:
    """Generate a filesystem-safe cache key for a niche + category combination."""
    raw = f"{niche.lower().strip()}_{category_id or 'unknown'}"
    slug = "".join(c if c.isalnum() or c in "-_" else "_" for c in raw)
    date = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    return f"{slug}_{date}"


def _cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.json"


class KeepaCache:
    """Simple JSON-file cache for normalized Keepa product data."""

    def __init__(self, ttl_hours: int = DEFAULT_TTL_HOURS):
        self.ttl = timedelta(hours=ttl_hours)
        CACHE_DIR.mkdir(exist_ok=True)

    def _is_fresh(self, path: Path) -> bool:
        """Return True if the cache file exists and is within the TTL window."""
        if not path.exists():
            return False
        mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
        return (datetime.now(tz=timezone.utc) - mtime) < self.ttl

    def get(self, niche: str, category_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """
        Retrieve cached data for a niche.
        Returns None if cache miss or entry is stale.
        """
        key = _cache_key(niche, category_id)
        path = _cache_path(key)

        if not self._is_fresh(path):
            return None

        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            print(f"  [cache HIT] {path.name}")
            return data
        except (json.JSONDecodeError, OSError) as exc:
            print(f"  [cache] Failed to read {path.name}: {exc}")
            return None

    def set(
        self,
        niche: str,
        data: Dict[str, Any],
        category_id: Optional[int] = None,
    ) -> Path:
        """
        Write normalized data to cache.
        Returns the path where it was written.
        """
        key = _cache_key(niche, category_id)
        path = _cache_path(key)

        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"  [cache WRITE] {path.name} ({path.stat().st_size // 1024} KB)")
        return path

    def invalidate(self, niche: str, category_id: Optional[int] = None) -> bool:
        """Delete a specific cache entry. Returns True if file was deleted."""
        key = _cache_key(niche, category_id)
        path = _cache_path(key)
        if path.exists():
            path.unlink()
            print(f"  [cache INVALIDATED] {path.name}")
            return True
        return False

    def list_entries(self) -> List[Dict[str, Any]]:
        """List all cache files with their age and size."""
        entries = []
        for p in sorted(CACHE_DIR.glob("*.json")):
            mtime = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc)
            age_hours = (datetime.now(tz=timezone.utc) - mtime).total_seconds() / 3600
            entries.append({
                "file": p.name,
                "size_kb": p.stat().st_size // 1024,
                "age_hours": round(age_hours, 1),
                "fresh": age_hours < DEFAULT_TTL_HOURS,
            })
        return entries
