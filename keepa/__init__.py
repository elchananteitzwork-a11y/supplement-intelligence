"""
Keepa API integration package — v0.5.0.

Data layer:   KeepaClient, normalize_product, KeepaCache
Analysis layer: keepa.bsr, keepa.reviews, keepa.prices, keepa.sales_estimate
Models:       BSRAnalysis, ReviewVelocityAnalysis, PriceAnalysis, KeepaReport
"""

__version__ = "0.5.0"

from keepa.client import KeepaClient, KeepaAPIError, KeepaRateLimitError
from keepa.normalizer import normalize_product
from keepa.cache import KeepaCache
from keepa.models import (
    NormalizedProduct,
    BSRAnalysis,
    ReviewVelocityAnalysis,
    PriceAnalysis,
    KeepaReport,
)
from keepa import bsr, reviews, prices, sales_estimate

__all__ = [
    "KeepaClient", "KeepaAPIError", "KeepaRateLimitError",
    "normalize_product", "KeepaCache",
    "NormalizedProduct", "BSRAnalysis", "ReviewVelocityAnalysis",
    "PriceAnalysis", "KeepaReport",
    "bsr", "reviews", "prices", "sales_estimate",
]
