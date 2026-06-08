"""
keepa/node_validator.py — Category node validation before product scanning.

Every Keepa subcategory node is validated before the discovery agent runs.

Primary approach: fetch the top 20 bestseller products from a candidate node
and score what fraction of returned titles match the intended category.

Fallback (when all candidates fail): use ASIN_SEEDS — known products in the
target category — to discover the correct node via Keepa's categoryTree field,
then validate that node.

Threshold: 80% match required to accept a node.
Token cost: ~42 tokens per candidate  (22 bestsellers + 20 titles at ~1/ASIN)
            ~2 tokens per ASIN seed lookup (minimal product fetch)

Usage:
    validator = NodeValidator(api_key=..., library_path="verified_node_library.json")
    result = validator.get_or_validate("candles")
    if result.passed:
        print(result.report())
        # proceed with result.node_id
"""

import json
import time
from dataclasses import dataclass, asdict
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional

import requests

# ── Configuration ─────────────────────────────────────────────────────────────

KEEPA_BASE           = "https://api.keepa.com"
VALIDATION_THRESHOLD = 0.80   # 80% of titles must match
VALIDATION_N         = 20     # products to fetch per candidate
_DELAY               = 0.4    # seconds between API calls


# ── Category keywords ─────────────────────────────────────────────────────────
# A product "matches" its category if its lowercased title contains
# at least one of these keywords.  Keep lists broad — false negatives
# (missing a real member) are worse than false positives.

CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "candles": [
        "candle", "soy candle", "wax", "wick", "scented candle",
        "pillar candle", "jar candle", "votive", "taper candle",
        "beeswax candle", "aromatherapy candle", "reed diffuser",
        "diffuser", "wax melt", "fragrance",
    ],
    "yoga_mats": [
        "yoga mat", "yoga", "pilates mat", "exercise mat",
        "workout mat", "fitness mat", "yoga block", "yoga strap",
        "yoga towel", "non-slip mat",
    ],
    "resistance_bands": [
        "resistance band", "exercise band", "loop band", "workout band",
        "resistance loop", "pull-up band", "booty band", "stretch band",
        "mini band", "fitness band", "elastic band", "resistance tube",
        "resistance set", "band set", "workout band",
    ],
    "teeth_whitening": [
        "whitening", "whitener", "teeth whitening", "tooth whitening",
        "whitening strip", "whitening pen", "whitening gel",
        "whitening kit", "dental whitening", "smile whitening",
        "bleaching", "charcoal toothpaste", "whitening toothpaste",
        "peroxide", "teeth white",
    ],
    "dog_treats": [
        "dog treat", "dog chew", "puppy treat", "dog snack",
        "dog biscuit", "rawhide", "dental chew", "dog bone",
        "training treat", "dog jerky", "dog reward", "peanut butter",
        "beef jerky dog", "chicken dog", "grain free treat",
        "dog food", "pet treat", "puppy chew",
    ],
    "ice_cube_molds": [
        "ice cube", "ice tray", "ice mold", "silicone tray",
        "freezer tray", "ice maker tray", "sphere ice",
        "nugget ice", "large ice cube", "stackable ice",
    ],
    "reusable_straws": [
        "straw", "drinking straw", "reusable straw",
        "metal straw", "silicone straw", "glass straw",
        "bamboo straw", "boba straw", "smoothie straw",
    ],
    "cooking_utensils": [
        "spatula", "wooden spoon", "tong", "tongs",
        "utensil", "whisk", "ladle", "turner", "cooking spoon",
        "kitchen utensil", "silicone spatula", "slotted spoon",
        "cooking set", "spoon set", "kitchen tool",
    ],
    "dog_kennels": [
        "dog crate", "kennel", "dog kennel", "pet crate",
        "wire crate", "dog cage", "playpen", "exercise pen",
        "dog pen", "puppy crate", "collapsible crate",
        "dog house", "crate cover", "crate pad",
    ],
    "potholders": [
        "oven mitt", "oven glove", "potholder", "pot holder",
        "hot pad", "kitchen glove", "heat resistant",
        "silicone mitt", "baking glove", "oven pad",
    ],
}


# ── Candidate nodes per category ──────────────────────────────────────────────
# Tried in order; stops at first node that passes validation.
# Known-bad nodes are excluded.  Confirmed-good nodes go first.

CANDIDATE_NODES: Dict[str, List[int]] = {
    "candles": [
        3734291,     # CONFIRMED CORRECT
        # 3734271 KNOWN BAD (returns storage products)
        15729881, 15729871, 15729891, 15729901,
        3734261,  3734281,  3734251,
        8509892011, 8509893011, 3734301,
    ],
    "yoga_mats": [
        3422301,     # DISCOVERED 2026-06-08 via parent-category scan (Amazon Basics Yoga Mat)
        # 3413761 KNOWN BAD — maps to "Tree Steps" (hunting), not yoga
    ],
    "resistance_bands": [
        23533915011,  # CONFIRMED 2026-06-07 via ASIN seed (95% Resistance Bands)
        # 3413771 KNOWN BAD — maps to "Trophy Mounts" (hunting)
    ],
    "teeth_whitening": [
        21193189011, # DISCOVERED 2026-06-08 via Health bestsellers (Crest 3D Whitestrips)
        3778371,     # Whitening Toothpaste — 65% match (fallback)
        # 3760951 KNOWN BAD — maps to "Allergy, Sinus & Asthma"
    ],
    "dog_treats": [
        2975436011,  # DISCOVERED 2026-06-08 via Dogs node scan (Greenies Pill Pockets)
        # 2975322011 KNOWN BAD — maps to "Necklaces & Pendants" (pet apparel)
    ],
    "dog_kennels": [
        # 2975330011 CONFIRMED as "Dog Beds" (NOT kennels — all 20 top products are beds/mats)
        # 2975314011 KNOWN BAD — maps to "Backpacks" (pet apparel)
        # Explored ranges: 2975313xxx, 2975330xxx–2975395xxx, 3024177xxx–3024195xxx — no kennels found
        # Actual kennels node is unknown; ASIN seeds also not in Keepa DB for crate products
        # Discovery skipped until correct node is found
    ],
    "ice_cube_molds": [
        2469549011,  # CONFIRMED CORRECT
    ],
    "reusable_straws": [
        21331300011,  # CONFIRMED CORRECT
    ],
    "cooking_utensils": [
        16439841,  # CONFIRMED CORRECT
    ],
    "potholders": [
        3742011,  # CONFIRMED CORRECT
    ],
}


# ── ASIN seeds for fallback node discovery ────────────────────────────────────
# When all CANDIDATE_NODES fail, fetch these known-good ASINs from Keepa,
# extract the deepest categoryTree node, and validate that node.

ASIN_SEEDS: Dict[str, List[str]] = {
    "yoga_mats": [
        # Specific child ASINs (not parent/variation ASINs) — verified popular products
        "B0777KFPP2",  # CAMBIVO large yoga mat (specific SKU)
        "B07VPJCS73",  # Gaiam Essentials yoga mat 6mm (specific SKU)
        "B09MQTX7FX",  # YUREN yoga mat (specific, high review count)
        "B07ZY4LNJK",  # Gruper yoga mat (specific SKU)
        "B01N7J68LO",  # BalanceFrom GoYoga yoga mat
    ],
    "resistance_bands": [
        "B01AVDVHTI",  # Whatafit resistance bands set (CONFIRMED WORKING)
        "B07892MMJ3",  # Tribe resistance bands
        "B088BFNRBT",  # Coolrunner resistance bands
    ],
    "teeth_whitening": [
        # Specific whitening product SKUs
        "B07HTKVXWP",  # Zimba whitening strips (specific)
        "B0041KNHCG",  # Cali White Kit (specific)
        "B08HX4N9QL",  # iSmile whitening strips (specific)
        "B07TT89QVZ",  # Auraglow whitening kit (specific)
        "B01CHBL5NW",  # Auraglow pen (specific)
    ],
    "dog_treats": [
        # Specific treat product SKUs
        "B00B0OC9OM",  # Stewart Pro-Treat freeze-dried liver (specific)
        "B07K5W3K4G",  # Zuke's training treats (specific)
        "B078NRBL3X",  # Hill's Science Diet treats (specific)
        "B09RQYDPBD",  # Rocco & Roxie treats (specific)
        "B003CZ8MCK",  # Wellness Soft WellBites treats (specific)
    ],
    "dog_kennels": [
        # Specific crate/kennel SKUs
        "B001CYUQXY",  # MidWest iCrate 24" (specific single-door SKU)
        "B073B5S57W",  # AmazonBasics double-door dog crate (specific)
        "B002CJHFWG",  # Precision Pet ProValu crate (specific)
        "B01EV0LVZ6",  # Frisco dog crate (specific)
        "B0014TICQO",  # Petmate kennel (specific)
    ],
}


# ── Data models ───────────────────────────────────────────────────────────────

@dataclass
class NodeValidation:
    category:         str
    node_id:          int
    validation_score: float          # 0.0–1.0
    matched:          int            # products that matched keywords
    total:            int            # products checked
    sample_products:  List[str]      # up to 5 titles
    validated_at:     str            # ISO date
    passed:           bool
    confidence:       str            # HIGH / MEDIUM / LOW / FAIL

    def report(self) -> str:
        lines = [
            f"  Category:         {self.category}",
            f"  Node ID:          {self.node_id}",
            f"  Validation score: {self.validation_score:.0%}  ({self.matched}/{self.total} match)",
            f"  Confidence:       {self.confidence}",
            f"  Validated:        {self.validated_at}",
            f"  Sample products:",
        ]
        for title in self.sample_products[:5]:
            lines.append(f"    · {title[:70]}")
        return "\n".join(lines)

    def to_dict(self) -> dict:
        return asdict(self)


# ── Persistent library ────────────────────────────────────────────────────────

class NodeLibrary:
    """
    JSON-backed dictionary of validated nodes.
    Keyed by category name.  Loaded once; written after every new validation.
    """

    def __init__(self, path: Path):
        self.path = path
        self._data: Dict[str, dict] = {}
        if path.exists():
            try:
                self._data = json.loads(path.read_text()).get("nodes", {})
            except (json.JSONDecodeError, KeyError):
                self._data = {}

    def get(self, category: str) -> Optional[NodeValidation]:
        entry = self._data.get(category)
        if not entry:
            return None
        try:
            return NodeValidation(**entry)
        except TypeError:
            return None

    def store(self, result: NodeValidation) -> None:
        self._data[result.category] = result.to_dict()
        payload = {"version": "1.0", "nodes": self._data}
        self.path.write_text(json.dumps(payload, indent=2))

    def has(self, category: str) -> bool:
        return category in self._data

    def summary(self) -> str:
        lines = [f"  Library: {len(self._data)} verified node(s)"]
        for cat, entry in sorted(self._data.items()):
            score = entry.get("validation_score", 0)
            nid   = entry.get("node_id", "?")
            conf  = entry.get("confidence", "?")
            lines.append(f"    {cat:22} node={nid:12} score={score:.0%} conf={conf}")
        return "\n".join(lines)


# ── Validator ─────────────────────────────────────────────────────────────────

class NodeValidator:

    def __init__(self, api_key: str, library_path: str = "verified_node_library.json"):
        self.api_key  = api_key
        self.library  = NodeLibrary(Path(library_path))

    # ── Public API ────────────────────────────────────────────────────────────

    def get_or_validate(
        self,
        category: str,
        force: bool = False,
    ) -> Optional[NodeValidation]:
        """
        Return a validated NodeValidation for *category*.

        1. If library has a passing entry and force=False → return it (free).
        2. Try each CANDIDATE_NODES entry in order; save first that passes.
        3. If all candidates fail, try ASIN_SEEDS to discover the correct node.
        4. Return None if nothing passes.
        """
        if not force:
            cached = self.library.get(category)
            if cached and cached.passed:
                return cached

        # ── Phase 1: Try candidate nodes ──────────────────────────────────────
        candidates = CANDIDATE_NODES.get(category, [])
        for node_id in candidates:
            print(f"  [validator] Trying node {node_id} for {category!r} …", end=" ", flush=True)
            result = self._validate_node(node_id, category)
            status = f"✓ {result.validation_score:.0%}" if result.passed else f"✗ {result.validation_score:.0%}"
            print(status)

            if result.passed:
                self.library.store(result)
                return result

            time.sleep(_DELAY)

        # ── Phase 2: ASIN seed fallback ───────────────────────────────────────
        seeds = ASIN_SEEDS.get(category, [])
        if seeds:
            print(f"  [validator] All candidates failed — trying ASIN seeds for {category!r}")
            discovered = self._discover_nodes_from_asins(seeds)
            for node_id in discovered:
                print(f"  [validator] Seed-discovered node {node_id} …", end=" ", flush=True)
                result = self._validate_node(node_id, category)
                status = f"✓ {result.validation_score:.0%}" if result.passed else f"✗ {result.validation_score:.0%}"
                print(status)

                if result.passed:
                    self.library.store(result)
                    return result

                time.sleep(_DELAY)

        return None

    def print_header(self, result: NodeValidation, category_display: str) -> None:
        """Print the validation header block before product scoring begins."""
        bar = "─" * 60
        print(f"\n{bar}")
        print(f"  PRE-SCAN VALIDATION — {category_display.upper()}")
        print(bar)
        print(result.report())
        if result.passed:
            print(f"  Status: ✅ PASS — proceeding to product scoring")
        else:
            print(f"  Status: ❌ FAIL — skipping product scoring")
        print(bar)

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _validate_node(self, node_id: int, category: str) -> NodeValidation:
        """Fetch products from node, score category match, return NodeValidation."""
        asins = self._bestseller_asins(node_id)[:VALIDATION_N]
        if not asins:
            return self._make_result(category, node_id, [], [], passed=False)

        time.sleep(_DELAY)
        titles = self._fetch_titles(asins)

        keywords  = CATEGORY_KEYWORDS.get(category, [])
        matched   = [t for t in titles if _title_matches(t, keywords)]
        score     = len(matched) / max(len(titles), 1)
        passed    = score >= VALIDATION_THRESHOLD

        sample = titles[:5]
        return self._make_result(category, node_id, titles, sample, passed, score)

    def _discover_nodes_from_asins(self, asins: List[str]) -> List[int]:
        """
        Fetch known-good ASINs from Keepa, extract their leaf categoryTree node IDs.
        Returns a deduplicated list of candidate node IDs to try (leaf first).

        Uses stats=90 to ensure Keepa returns full product data including categoryTree.
        stats=0 may cause empty product responses for some ASINs.
        """
        nodes: List[int] = []
        seen: set = set()

        for asin in asins:
            try:
                r = requests.get(
                    f"{KEEPA_BASE}/product",
                    params={
                        "key": self.api_key, "domain": 1,
                        "asin": asin,
                        "stats": 90, "history": 0, "rating": 0,
                    },
                    timeout=20,
                )
                data = r.json()
                products = data.get("products", [])
                if not products:
                    continue
                p = products[0]
                cat_tree = p.get("categoryTree", [])
                # Try leaf node first, then parent nodes (most → least specific)
                for node_entry in reversed(cat_tree):
                    nid = node_entry.get("catId")
                    if nid and nid not in seen:
                        seen.add(nid)
                        nodes.append(nid)
            except Exception:
                pass
            time.sleep(_DELAY)

        return nodes

    @staticmethod
    def _make_result(
        category, node_id, titles, sample,
        passed, score=0.0,
    ) -> NodeValidation:
        n       = len(titles)
        matched = int(round(score * n))
        if score >= 0.90:   conf = "HIGH"
        elif score >= 0.80: conf = "MEDIUM"
        elif score >= 0.50: conf = "LOW"
        else:               conf = "FAIL"

        return NodeValidation(
            category=category, node_id=node_id,
            validation_score=round(score, 3),
            matched=matched, total=n,
            sample_products=sample,
            validated_at=date.today().isoformat(),
            passed=passed, confidence=conf,
        )

    def _bestseller_asins(self, node_id: int) -> List[str]:
        try:
            r = requests.get(
                f"{KEEPA_BASE}/bestsellers",
                params={"key": self.api_key, "domain": 1, "category": node_id},
                timeout=12,
            )
            data = r.json()
            return data.get("bestSellersList", {}).get("asinList", [])
        except Exception:
            return []

    def _fetch_titles(self, asins: List[str]) -> List[str]:
        if not asins:
            return []
        try:
            r = requests.get(
                f"{KEEPA_BASE}/product",
                params={
                    "key": self.api_key, "domain": 1,
                    "asin": ",".join(asins),
                    "stats": 0, "history": 0, "rating": 0,
                },
                timeout=20,
            )
            data = r.json()
            return [
                p.get("title", "") or ""
                for p in data.get("products", [])
                if p.get("title")
            ]
        except Exception:
            return []


# ── Keyword matching ──────────────────────────────────────────────────────────

def _title_matches(title: str, keywords: List[str]) -> bool:
    """Return True if the lowercased title contains at least one keyword."""
    low = title.lower()
    return any(kw in low for kw in keywords)
