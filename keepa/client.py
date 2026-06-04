"""
Keepa API HTTP client.

All Keepa API calls are routed through this module.
No other module in this package makes HTTP requests directly.

Keepa API docs: https://keepa.com/#!discuss/t/request-products/784
"""

import os
import time
from typing import Any, Dict, List, Optional

import requests


KEEPA_BASE_URL = "https://api.keepa.com"
DOMAIN_US = 1
REQUEST_TIMEOUT_S = 30
BATCH_SIZE = 100  # Keepa max ASINs per product request


class KeepaAPIError(Exception):
    """Raised for non-recoverable Keepa API errors."""


class KeepaRateLimitError(KeepaAPIError):
    """Raised when token balance is zero."""


class KeepaClient:
    """
    Thin HTTP wrapper around the Keepa REST API.
    Handles auth, timeouts, HTTP errors, and token reporting.
    Does NOT handle caching or data normalization — those live elsewhere.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("KEEPA_API_KEY", "").strip()
        if not self.api_key:
            raise ValueError(
                "Keepa API key missing.\n"
                "Set the KEEPA_API_KEY environment variable, "
                "or copy .env.example to .env and add your key.\n"
                "Get a key at: https://keepa.com/#!api"
            )
        self._session = requests.Session()
        self._session.headers["User-Agent"] = "amazon-opportunity-hunter/0.5.0"
        self.last_tokens_left: int = -1

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get(self, endpoint: str, params: Dict[str, Any]) -> Dict[str, Any]:
        params["key"] = self.api_key
        url = f"{KEEPA_BASE_URL}/{endpoint}"

        try:
            resp = self._session.get(url, params=params, timeout=REQUEST_TIMEOUT_S)
            resp.raise_for_status()
        except requests.Timeout:
            raise KeepaAPIError(
                f"Request to /{endpoint} timed out after {REQUEST_TIMEOUT_S}s. "
                "Keepa may be slow — retry in a moment."
            )
        except requests.HTTPError:
            raise KeepaAPIError(
                f"HTTP {resp.status_code} from Keepa /{endpoint}. "
                f"Response: {resp.text[:200]}"
            )
        except requests.RequestException as exc:
            raise KeepaAPIError(f"Network error calling Keepa /{endpoint}: {exc}")

        data = resp.json()

        # Every Keepa response includes the current token balance.
        self.last_tokens_left = data.get("tokensLeft", -1)
        if self.last_tokens_left == 0:
            raise KeepaRateLimitError(
                "Token balance is 0. Tokens regenerate over time based on your plan. "
                f"refillIn={data.get('refillIn', '?')}s, "
                f"refillRate={data.get('refillRate', '?')} tokens/min."
            )

        return data

    # ------------------------------------------------------------------
    # Public API methods
    # ------------------------------------------------------------------

    def get_token_status(self) -> Dict[str, Any]:
        """
        Returns current token balance without fetching any product data.
        Costs 0 tokens.
        """
        data = self._get("token", {})
        return {
            "tokens_left": data.get("tokensLeft", -1),
            "refill_in_seconds": data.get("refillIn", -1),
            "refill_rate_per_minute": data.get("refillRate", -1),
            "monthly_limit": data.get("monthlyLimit", -1),
        }

    def get_products(
        self,
        asins: List[str],
        domain: int = DOMAIN_US,
        stats: int = 90,
        include_history: bool = True,
        include_rating: bool = True,
        offers: int = 20,
    ) -> Dict[str, Any]:
        """
        Fetch full product data for up to 100 ASINs in one request.

        Args:
            asins:           List of ASIN strings (max 100).
            domain:          Marketplace ID. 1 = Amazon US.
            stats:           Statistics window in days (30, 90, 180, 365, 730).
            include_history: Include full CSV time-series history.
            include_rating:  Include review count and rating history.
            offers:          Number of live seller offers to include.

        Returns raw Keepa response dict. Normalization happens in normalizer.py.
        """
        if not asins:
            raise ValueError("asins list is empty.")
        if len(asins) > BATCH_SIZE:
            raise ValueError(
                f"Maximum {BATCH_SIZE} ASINs per request. "
                f"Got {len(asins)}. Split into batches."
            )

        params: Dict[str, Any] = {
            "domain": domain,
            "asin": ",".join(asins),
            "stats": stats,
            "history": int(include_history),
            "rating": int(include_rating),
            "offers": offers,
            "only-live-offers": 1,
            "update": 0,          # serve from Keepa's cache, no force-refresh
            "stock": 1,           # include stock availability
        }
        return self._get("product", params)

    def get_best_sellers(
        self, category_id: int, domain: int = DOMAIN_US
    ) -> Dict[str, Any]:
        """
        Fetch the current Best Sellers ASIN list for a category node.
        Returns up to ~100 ASINs ranked in that category.

        Find category node IDs at:
        https://www.amazon.com/gp/browse.html (look at the URL node= param)
        Common nodes: Kitchen=284507, Pet Supplies=2619533, Sports=3375251
        """
        params = {"domain": domain, "category": category_id}
        return self._get("bestsellers", params)

    def get_category(
        self, category_id: int, domain: int = DOMAIN_US
    ) -> Dict[str, Any]:
        """
        Fetch category metadata: name, parent chain, subcategory IDs.
        Useful for resolving a niche keyword to the correct category node.
        """
        params = {"domain": domain, "category": category_id, "parents": 1}
        return self._get("category", params)

    def get_seller(
        self, seller_id: str, domain: int = DOMAIN_US
    ) -> Dict[str, Any]:
        """
        Fetch seller profile: feedback count, rating, storefront ASIN count.
        Used to verify whether a seller is genuinely small vs. established.
        """
        params = {"domain": domain, "seller": seller_id}
        return self._get("seller", params)

    def get_products_batched(
        self,
        asins: List[str],
        domain: int = DOMAIN_US,
        stats: int = 90,
        delay_between_batches: float = 1.0,
    ) -> List[Dict[str, Any]]:
        """
        Fetch data for more than 100 ASINs by splitting into BATCH_SIZE chunks.
        Adds a short delay between batches to avoid hammering the API.

        Returns a flat list of raw product dicts from all batches combined.
        """
        all_products: List[Dict[str, Any]] = []
        batches = [
            asins[i : i + BATCH_SIZE]
            for i in range(0, len(asins), BATCH_SIZE)
        ]

        for idx, batch in enumerate(batches):
            print(
                f"  Fetching batch {idx + 1}/{len(batches)} "
                f"({len(batch)} ASINs) — tokens left: {self.last_tokens_left}"
            )
            resp = self.get_products(batch, domain=domain, stats=stats)
            products = resp.get("products", [])
            all_products.extend(products)

            if idx < len(batches) - 1:
                time.sleep(delay_between_batches)

        return all_products
