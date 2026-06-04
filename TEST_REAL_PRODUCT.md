# Test Real Product — Keepa Layer

## 1. Is the Keepa integration production ready?

**No. The data-fetch layer works. The analysis layer does not exist.**

| Component | Status | Notes |
|-----------|--------|-------|
| `client.py` | Ready | Auth, batching, error handling, token tracking all solid |
| `normalizer.py` | Mostly ready | Two bugs (see §2) |
| `cache.py` | Ready | JSON disk cache, TTL, invalidation work correctly |
| `models.py` | Shell only | All dataclasses defined but **nothing populates them** |

The `keepa/` folder has **no analysis code** — `BSRAnalysis`, `ReviewVelocityAnalysis`,
`PriceAnalysis`, and `KeepaReport` are empty contracts. `normalize_product()` returns a
plain `dict`, not a `NormalizedProduct`. The models are never instantiated anywhere.

---

## 2. What is missing before I can run a real product analysis?

### Bugs in `normalizer.py`

**Bug 1 — Dead variable (line 194)**
```python
# This is computed but never used. Remove it or use it.
current_bsr = _stat("current", None) if isinstance(stats.get("current"), list) else None
```

**Bug 2 — Wrong stats key for review delta (line 244)**
```python
# WRONG: deltaViews90 is page views, not review count
"review_count_delta": stats.get("deltaViews90") ...

# CORRECT
"review_count_delta": stats.get("deltaReviews90") ...
```

### Missing analysis implementations

Nothing in `keepa/` computes these fields on `BSRAnalysis`:
- `trend_direction`, `trend_slope_per_day`
- `bsr_volatility`, `bsr_std_dev`
- `estimated_monthly_sales`, `sales_estimate_confidence`
- `demand_velocity`, `is_seasonal`, `seasonal_peak_month`

Nothing computes `ReviewVelocityAnalysis` seller tiers, velocity, or R2R efficiency.  
Nothing computes `PriceAnalysis` band, compression, trend, or Buy Box stats.  
Nothing builds a `KeepaReport` from any of the above.

**What you CAN do today:** fetch raw product data, normalize it, cache it, and write it to
`keepa-report.json` as normalized dicts. That is the usable scope of this layer.

---

## 3. Fix the two bugs first

```bash
# Fix Bug 2 — wrong review delta key
sed -i '' 's/deltaViews90/deltaReviews90/g' keepa/normalizer.py

# Fix Bug 1 — remove the dead variable (optional, cosmetic)
```

---

## 4. Exact commands

### Add a real Keepa API key

```bash
export KEEPA_API_KEY="your_key_here"
```

Or persist it:
```bash
echo "KEEPA_API_KEY=your_key_here" >> .env
export $(cat .env | xargs)
```

Verify the key is live (costs 0 tokens):
```bash
python3 -c "
from keepa.client import KeepaClient
c = KeepaClient()
print(c.get_token_status())
"
```

---

### Run a real product analysis and generate keepa-report.json

Replace `CATEGORY_ID` with the Amazon browse node you want (examples below), then run:

```bash
python3 - << 'EOF'
import json, datetime
from keepa.client import KeepaClient
from keepa.normalizer import normalize_product
from keepa.cache import KeepaCache

NICHE = "kitchen"
CATEGORY_ID = 284507   # Kitchen & Dining — change this

client = KeepaClient()
cache  = KeepaCache()

# Check token balance first
status = client.get_token_status()
print(f"Tokens left: {status['tokens_left']}")
if status["tokens_left"] < 50:
    raise SystemExit("Not enough tokens. Check your plan at keepa.com.")

# Try cache first
cached = cache.get(NICHE, CATEGORY_ID)
if cached:
    products = cached["products"]
    print(f"Loaded {len(products)} products from cache.")
else:
    # Fetch top ASINs for the category
    best_resp = client.get_best_sellers(category_id=CATEGORY_ID)
    asins = best_resp.get("bestSellersList", {}).get("asinList", [])[:20]
    print(f"Found {len(asins)} ASINs for category {CATEGORY_ID}")

    if not asins:
        raise SystemExit("No ASINs returned. Check CATEGORY_ID.")

    # Fetch + normalize
    raw_resp = client.get_products(asins)
    products = [normalize_product(p) for p in raw_resp.get("products", [])]
    print(f"Normalized {len(products)} products. Tokens left: {client.last_tokens_left}")

    cache.set(NICHE, {"products": products}, CATEGORY_ID)

# Write keepa-report.json
report = {
    "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
    "niche": NICHE,
    "category_id": CATEGORY_ID,
    "marketplace": "US",
    "tokens_left": client.last_tokens_left,
    "products_count": len(products),
    "products": products,
}

with open("keepa-report.json", "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)

print(f"Written keepa-report.json ({len(products)} products)")
EOF
```

---

### Common category node IDs

| Category | Node ID |
|----------|---------|
| Kitchen & Dining | 284507 |
| Pet Supplies | 2619533 |
| Sports & Outdoors | 3375251 |
| Home & Garden | 1055398 |
| Baby | 165796011 |
| Health & Household | 3760901 |

Find any node: open `amazon.com/s?k=your+keyword`, click a category filter, copy the `node=` param from the URL.

---

### Verify the output

```bash
# Count products written
python3 -c "import json; d=json.load(open('keepa-report.json')); print(d['products_count'], 'products')"

# Inspect first product
python3 -c "import json; d=json.load(open('keepa-report.json')); import pprint; pprint.pprint(d['products'][0])"

# Check BSR data is present
python3 -c "
import json
d = json.load(open('keepa-report.json'))
for p in d['products'][:5]:
    bsr = p['current']['bsr']
    title = (p.get('title') or '')[:50]
    print(f'BSR={bsr:>8}  {title}')
"
```
