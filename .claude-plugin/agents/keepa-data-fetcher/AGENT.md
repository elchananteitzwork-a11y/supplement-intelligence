# Agent: keepa-data-fetcher

## Role
Sole Keepa API communication layer. Every Keepa API call in the system flows through this agent. No other agent ever calls the Keepa API directly.

## Trigger
Called by `run_keepa_phase1.py` as Step 1. In Phase 2+, called by the `product-hunt` skill before the 12-step analysis pipeline begins.

## Implementation
`fetcher.py` in this directory.

## Run
```bash
python .claude-plugin/agents/keepa-data-fetcher/fetcher.py "dog lick mats"
python .claude-plugin/agents/keepa-data-fetcher/fetcher.py "silicone kitchen tools" --category-id 284507
python .claude-plugin/agents/keepa-data-fetcher/fetcher.py "pet accessories" --force-refresh
```

## Input
```
niche:          <string>          # Plain-language niche keyword
category_id:    <int|None>        # Override Keepa category node ID
max_products:   <int=100>         # Cap on ASINs to fetch
stats_days:     <int=90>          # Statistics window in days
force_refresh:  <bool=False>      # Bypass disk cache
```

## What it does
1. Checks disk cache (`keepa_cache/`). Returns cached data if fresh (< 24h).
2. Resolves niche keyword → Keepa category node ID (from built-in map or explicit override).
3. Calls `/bestsellers` endpoint → gets up to 100 top-ranked ASINs.
4. Calls `/product` endpoint in batches of 100 ASINs → gets full 90-day history.
5. Normalizes all Keepa timestamps (Keepa minutes → ISO 8601).
6. Normalizes all prices (Keepa cents → USD floats).
7. Writes normalized result to `keepa_cache/{slug}_{date}.json`.
8. Returns structured dict with `metadata` + `normalized_products` + `raw_asin_list`.

## Output structure
```json
{
  "metadata": {
    "niche": "dog lick mats",
    "category_id": 2619533,
    "marketplace": "US",
    "fetched_at": "2026-06-03T...",
    "tokens_used_estimate": 650,
    "tokens_remaining": 600
  },
  "normalized_products": [ ... ],
  "raw_asin_list": ["B0...", "B0...", ...]
}
```

## Environment
Requires `KEEPA_API_KEY` environment variable. Set in `.env` file (see `.env.example`).

## Cache
- Location: `keepa_cache/` (gitignored)
- TTL: 24 hours (override with `KEEPA_CACHE_TTL_HOURS` env var)
- Key: `{niche_slug}_{category_id}_{YYYY-MM-DD}.json`

## Token cost estimate
~600–950 tokens per 100-product analysis (90-day history).

## Constraints
- Maximum 100 ASINs per `/product` request (Keepa limit). Batching is automatic.
- Returns empty product list if category node cannot be resolved and no ASIN list is provided.
- All downstream agents receive normalized dicts — never raw Keepa format.
