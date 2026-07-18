import type { SignalProvider, SignalContext, ProviderSignals, SocialCommerceSignal } from '../types'
import { cacheGet, cacheSet } from '../../provider-cache'

// ── Apify `pratikdani/tiktok-shop-search-scraper` — TikTok Shop Intelligence
// (Social Commerce) — Roadmap M3.5, Path B (additive-only) ──────────────────
//
// Approved via architecture research + explicit owner decision: this is an
// ISOLATED, additive Commerce-layer signal. It is NOT blended into `demand`,
// NOT part of `BASE_WEIGHTS` (lib/scoring.ts), NOT part of
// `DEMAND_CHANNELS` (lib/concordance.ts), and NOT consumed by any kill
// switch or verdict path. See lib/signal-engine/types.ts's
// `SocialCommerceSignal` for how this attaches directly to `ProviderSignals`
// as its own named field with zero involvement in engine.ts's `dims`
// array/aggregateDimension() cross-provider blending — the field is
// structurally incapable of contaminating `demand`, not merely unweighted.
//
// Actor confirmed live 2026-07-17 (isPublic, 60k+ total runs, 17.5k+
// successful runs in the trailing 30 days): real, self-serve, real
// documented pricing — apify-actor-start $0.002 (one-time per run) +
// per-result event, tiered by Apify plan ($0.015/result on the FREE tier
// down to $0.009/result on paid tiers) — CONFIRMED VIA LIVE CALL against
// Apify's own /v2/acts/{id} endpoint, not assumed.
//
// ── (a) Derivation methodology and its limitation ───────────────────────────
// `estimated_gmv_total` is `sold_count × price_usd`, summed across every
// real, usable result (see computeSignals). BOTH inputs are real fields
// this actor returns, CONFIRMED VIA LIVE CALL against its real build
// metadata/example output (2026-07-17):
//   - `sold_count` is TikTok Shop's own CUMULATIVE LIFETIME units-sold
//     counter for that one product listing — not a bounded period. It has
//     no public definition of what TikTok itself counts as a "sale"
//     (returns/refunds/promotional units unknown), same category of
//     disclosed unknown as review counts elsewhere in this codebase.
//   - `price_usd` is the listing's CURRENT price, applied retroactively
//     across that entire unbounded lifetime of units. A product that
//     launched at $40 and now sells at $15 (or vice versa) produces a
//     materially wrong lifetime GMV estimate either way — there is no
//     price-history field on this actor to correct for it.
// This is why FIXED_CONFIDENCE below is a flat constant, not scaled up by
// result count the way lib/signal-engine/providers/competition.ts's
// `confidence` is: a bigger sample makes the derived SUM bigger and more
// internally consistent, but does nothing to fix either structural
// weakness above. NEVER present `estimated_gmv_total` anywhere as a
// TikTok-reported GMV figure — it is this codebase's own arithmetic over
// two real fields, always LIMITED confidence, always labeled `methodology:
// 'derived_sold_count_x_price_lifetime_cumulative'`.
//
// Deliberately NOT read: the actor also returns `total_sales`/
// `total_sales_usd` (an upstream-computed figure whose own derivation this
// codebase cannot verify or disclose) and `week_sales`/`week_sold_count`
// (a real, separately-scraped BOUNDED 7-day figure). Both are left unread
// this milestone — the approved R&D document scoped this milestone to the
// disclosed lifetime-cumulative derivation only; `week_sold_count` in
// particular is a genuine finding for a FUTURE milestone to evaluate (it
// may let a later iteration derive real bounded-period GMV/velocity without
// waiting on repeated `niche_timeseries` snapshots at all) but is out of
// scope here, not silently used.
//
// ── (b) Social Commerce Calibration Gate ─────────────────────────────────────
// This signal ships isolated on purpose. Before ANY future milestone may
// wire `social_commerce`/`SocialCommerceSignal` into `BASE_WEIGHTS`,
// `lib/concordance.ts`, `lib/verdict-matrix.ts`, or any kill switch, ALL of
// the following must be true:
//
//   (i)   REAL OBSERVATION HISTORY. At least MIN_OBSERVATIONS_PER_NICHE (8)
//         real weekly `tiktok-shop` observations (lib/watchlist/recheck.ts's
//         real Monday cron cadence — see lib/watchlist/schedule.ts) — i.e.
//         roughly 2 real months, not a projection — per niche, across at
//         least MIN_BENCHMARK_NICHES (5) distinct actively-watched
//         benchmark niches, spanning a minimum bounded window of
//         MIN_CALIBRATION_WINDOW_WEEKS (8) weeks. This mirrors this
//         codebase's own established cold-start conventions (Discovery
//         Engine's "roughly 3-4 weeks" niche_timeseries baseline,
//         lib/pattern-detection/acceleration.ts's ">=2 real points" floor)
//         but is deliberately larger: a single TikTok Shop search page's
//         top-10 results reshuffle noisily week to week (unlike Keepa's
//         bestseller list), so more real weeks are needed before ANY
//         acceleration/divergence primitive (lib/pattern-detection/
//         acceleration.ts, lib/pattern-detection/divergence.ts — the exact,
//         already-built primitives a future milestone would reuse once
//         this history exists; NOT wired up this milestone) can be trusted
//         to distinguish genuine movement from single-snapshot noise.
//   (ii)  CAPPED CORROBORATION ONLY. Once wired in, `social_commerce` may
//         NEVER independently trigger a BUILD_NOW or AVOID verdict while
//         its confidence remains LIMITED — only ever adjust
//         confidence/context WITHIN a bound set by other, higher-provenance
//         signals (Keepa, DataForSEO, PubMed/ClinicalTrials.gov). A query
//         with strong `social_commerce` numbers and no corroborating
//         Amazon/search/science evidence must never be able to move a
//         verdict on its own.
//   (iii) REAL CALIBRATION AGAINST REALIZED OUTCOMES. A real comparison of
//         `social_commerce` readings against realized Verdict Ledger
//         outcomes (lib/verdict-ledger — same discipline as M3.1's
//         "≥2 real quarters of outcomes" verdict-calibration gate and
//         M3.2's learned-weight refit) must be run and published before
//         this signal's weight (if any) is anything other than a
//         conservative, disclosed placeholder.
//
// ── (3) Provider abstraction for future swappability ─────────────────────────
// The Apify-specific HTTP/auth logic lives ENTIRELY in `fetchFromApify()`
// below. `computeSignals()` shapes the final `SocialCommerceSignal` from a
// generic `TikTokShopResult[]` and knows nothing about Apify. A future
// `KalodataProvider`/`FastMossProvider` (real reported-GMV enterprise data,
// once/if evaluated) implementing the same `SignalProvider` interface and
// producing the same `SocialCommerceSignal` shape — with a different
// `data_source` string, a different `methodology` value, and a real,
// non-capped confidence once real reported GMV exists — could be
// registered in registry.ts in place of or alongside this one with zero
// change to types.ts, engine.ts, or any downstream consumer.

const ACTOR_ENDPOINT = 'https://api.apify.com/v2/acts/pratikdani~tiktok-shop-search-scraper/run-sync-get-dataset-items'
const CACHE_TTL_MS   = 7 * 24 * 60 * 60 * 1000  // 7 days — same cost-consciousness precedent as competition.ts's SERP_CACHE_TTL_MS

// The actor's own hard per-request result ceiling (real, confirmed via live
// call against its input schema: `limit` has `"maximum": 10`) — not a
// cost-control choice this codebase made, an upstream constraint.
const MAX_ITEMS = 10
// A query needs at least this many real, usable (sold_count + parseable
// price) results before this is trusted as a real sample rather than one
// or two thin/promotional listings — same "honest floor" spirit as
// competition.ts's MIN_RESULTS, scaled down to match this actor's much
// smaller MAX_ITEMS ceiling.
const MIN_RESULTS = 3

// Deliberately a FIXED constant — see header comment (a) for why a bigger
// sample does not fix this source's structural weaknesses. LIMITED tier.
export const FIXED_CONFIDENCE = 0.3

export const DATA_SOURCE = 'apify:pratikdani/tiktok-shop-search-scraper'

// Social Commerce Calibration Gate thresholds — see header comment (b).
// Exported so a future calibration worker can assert against the exact,
// disclosed numbers this header comment commits to, rather than a second,
// possibly-drifted copy.
export const MIN_OBSERVATIONS_PER_NICHE    = 8   // real weekly tiktok-shop observations per niche
export const MIN_BENCHMARK_NICHES          = 5   // distinct actively-watched niches
export const MIN_CALIBRATION_WINDOW_WEEKS  = 8   // minimum bounded real time window

// ── Raw response shape (Apify dataset item) ──────────────────────────────
// Field names CONFIRMED VIA LIVE CALL against the actor's own real build
// metadata (actorDefinition.readme's "Output Fields" table + a real
// example item), 2026-07-17 — not guessed. Only the fields this provider
// actually uses are typed; everything else the actor returns
// (images_privatization, skus, shop, sale_props, etc.) is real but unused
// here.
interface TikTokShopResult {
  id?:             string
  title?:          string
  seller_name?:    string
  // Real current listing price, USD-normalized because every request below
  // fixes country_code to "US" — CONFIRMED VIA LIVE CALL: price_usd and
  // price carry the same value for a US-country request. price_usd is
  // preferred; price is a real fallback only, never a guessed default.
  price_usd?:      string   // e.g. "$8.99"
  price?:          string   // e.g. "$8.99"
  // Bug-fix audit Finding 2 (2026-07-18): the actor's real, documented
  // output also includes a standalone `currency` field, distinct from
  // `price` (general, not USD-specific) and `price_usd` (already a
  // USD-converted field). Only used to gate the `price` fallback below
  // (see usdPriceFallback()) — `price_usd` needs no such gating, it's
  // already documented as USD.
  currency?:       string
  // CONFIRMED VIA LIVE CALL 2026-07-17: real cumulative LIFETIME units-sold
  // counter — see header comment (a). Never a bounded-period figure.
  sold_count?:     number
  rank?:           number   // real TikTok Shop search-result rank, when present
  product_status?: boolean  // true = currently active listing
}

function parsePriceUsd(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (!cleaned) return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

// Bug-fix audit Finding 2 (2026-07-18): the previous fallback chain
// (`parsePriceUsd(r.price_usd) ?? parsePriceUsd(r.price)`) never checked
// `currency` before trusting the raw `price` field as USD — if `price_usd`
// was absent/unparseable and the item's real currency wasn't USD, that
// number was silently treated as a USD value. Same bug class as, and gated
// EXACTLY the same way as, competition.ts's `usdPrice()` (~line 140): the
// `price` fallback is only used when `currency` is confirmed `'$'`/`'USD'`.
// `price_usd` is never routed through this gate — it's already a documented
// USD-converted field.
//
// Independent-review correction (2026-07-18): an earlier version of this
// gate additionally allowed the fallback when `currency` was entirely
// ABSENT, reasoning that (unlike competition.ts's `price.currency`, which
// is always present whenever `price` itself is, per that actor's real,
// live-confirmed shape) this actor's `currency` field might be omitted for
// reasons unrelated to non-USD pricing. That reasoning was NOT tagged
// `CONFIRMED VIA LIVE CALL` like every other actor-behavior claim in this
// file (see lines 21, 27, 140, 151, 163) — and per this bug-fix task's own
// constraint (no paid Apify calls possible right now), it genuinely cannot
// be live-confirmed today. If the real actor also omits `currency` on some
// non-USD listings, that asymmetric gate would let a real non-USD price
// slip through mislabeled as USD — the exact failure class this fix exists
// to prevent. Reverted to the strict, conservative behavior below (absent
// currency also rejects the fallback) pending a future, live-confirmed
// Phase B check of this actor's real currency-field behavior — this is a
// deliberately safer default, not a final design decision.
function usdPriceFallback(price: string | undefined, currency: string | undefined): number | undefined {
  const parsed = parsePriceUsd(price)
  if (parsed === undefined) return undefined
  const trimmedCurrency = currency?.trim()
  if (trimmedCurrency !== '$' && trimmedCurrency !== 'USD') return undefined
  return parsed
}

function avg(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
}

// Bug-fix audit Finding 1 (2026-07-18): sponsored + organic placements for
// the same real TikTok Shop product id appearing twice in one real search
// response is the same real, documented phenomenon already fixed for ASINs
// in competition.ts's dedupeByAsin() (~line 160 there) — with no dedupe,
// that single real listing would double-count in
// estimated_gmv_total/sold_count_total and appear twice in top_products,
// especially impactful given this actor's small MAX_ITEMS (10)/MIN_RESULTS
// (3) sample sizes. Keeps the FIRST occurrence of each real `id` — i.e. its
// earliest appearance in this exact response, assuming `items` arrives in
// the actor's real search-result order. Unlike competition.ts's junglee
// actor (confirmed via live call to have NO separate rank field, making
// array index the only real ordering signal), this actor also exposes its
// own `rank?: number` field — so "array order = real search rank" is an
// unverified, best-effort assumption here, not a live-confirmed one; it
// only affects WHICH of two duplicate entries is kept, never whether
// dedup happens. Items with no real `id` at all have nothing reliable to
// dedupe against, so they all pass through unchanged — same
// non-destructive behavior as dedupeByAsin.
function dedupeById<T extends { id?: string }>(items: T[]): T[] {
  const seenIds = new Set<string>()
  const result: T[] = []
  for (const r of items) {
    const id = r.id?.trim()
    if (id) {
      if (seenIds.has(id)) continue
      seenIds.add(id)
    }
    result.push(r)
  }
  return result
}

export class TikTokShopProvider implements SignalProvider {
  readonly name    = 'tiktok-shop'
  readonly enabled = !!process.env.APIFY_API_TOKEN

  async fetch(ctx: SignalContext): Promise<ProviderSignals | null> {
    if (!this.enabled) return null
    const query = ctx.query
    if (!query.trim()) return null

    const cacheKey = `tiktok-shop:v1:${query.toLowerCase().trim()}`
    const cached = await cacheGet<ProviderSignals>(cacheKey)
    if (cached) {
      console.log('[TikTokShop] cache HIT', { query })
      return cached
    }

    const items = await this.fetchFromApify(query)
    if (!items) return null

    // MIN_RESULTS gates on the USABLE count, not the raw Apify item count —
    // a raw item is only usable once it has BOTH a numeric sold_count and a
    // parseable price (see filterUsable). Gating on the raw count would let
    // a response with enough raw items but too few real, computable ones
    // through, producing a real-looking SocialCommerceSignal with
    // sample_size 0 (or some other count below the honest floor) instead
    // of the honest `null` this floor exists to guarantee.
    const usable = this.filterUsable(items)
    if (usable.length < MIN_RESULTS) {
      console.log('Apify tiktok-shop-search-scraper: too few usable results', {
        query, rawCount: items.length, usableCount: usable.length,
      })
      return null
    }

    const result = this.computeSignals(usable, items.length)
    cacheSet(cacheKey, this.name, result, CACHE_TTL_MS).catch(() => {})
    return result
  }

  // ── Apify-specific HTTP/auth — isolated per requirement (3) above ────────
  private async fetchFromApify(query: string): Promise<TikTokShopResult[] | null> {
    try {
      const url = `${ACTOR_ENDPOINT}?timeout=90`
      const res = await fetch(url, {
        method:  'POST',
        signal:  AbortSignal.timeout(80_000),
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}`,
        },
        body: JSON.stringify({
          country_code: 'US',   // required by the actor's own input schema; fixes price_usd to real USD values
          keyword:      query,
          limit:        MAX_ITEMS,
          page:         1,
        }),
      })

      if (!res.ok) {
        console.error('Apify tiktok-shop-search-scraper HTTP error', { status: res.status, query })
        return null
      }

      const items: unknown = await res.json()
      if (!Array.isArray(items)) {
        console.error('Apify tiktok-shop-search-scraper: unexpected non-array response', { query })
        return null
      }
      return items as TikTokShopResult[]
    } catch (e: unknown) {
      console.error('Apify tiktok-shop-search-scraper provider error', { query, error: e instanceof Error ? e.message : e })
      return null
    }
  }

  // Only real, usable results: a numeric sold_count AND a parseable price.
  // A result missing either is EXCLUDED, never zero-filled or guessed —
  // same honesty discipline as every other provider here. Extracted as its
  // own method (rather than inlined in computeSignals, as it originally
  // was) specifically so fetch()'s MIN_RESULTS gate can check the count
  // AFTER this exclusion runs, not the raw Apify item count — see fetch()'s
  // own comment for why gating on the raw count was a real bug.
  //
  // Finding 1 (id dedupe): runs FIRST, over the raw response, so a
  // duplicate id's sponsored+organic pair never both survive into
  // computeSignals — mirrors competition.ts's ordering (dedupe before its
  // own usable-set filter).
  private filterUsable(items: TikTokShopResult[]): (TikTokShopResult & { sold_count: number; _price: number })[] {
    const deduped = dedupeById(items)
    const withPrice = deduped.map(r => ({
      ...r,
      // Finding 2 (currency): the `price` fallback is gated by
      // usdPriceFallback() — see its own comment. `price_usd` is used
      // directly, no gating needed.
      _price: parsePriceUsd(r.price_usd) ?? usdPriceFallback(r.price, r.currency),
    }))
    return withPrice.filter(
      (r): r is typeof r & { sold_count: number; _price: number } =>
        typeof r.sold_count === 'number' && r.sold_count >= 0 && typeof r._price === 'number',
    )
  }

  // ── Output shaping — Apify-agnostic, per requirement (3) above ───────────
  // `usable` is ALREADY the post-filterUsable set (see fetch()) — never
  // re-filtered here, so this method's own output count can never diverge
  // from what fetch()'s MIN_RESULTS gate actually checked. `rawCount` is
  // passed through only for logging (real total Apify items vs. real
  // usable count), never used in any threshold decision.
  private computeSignals(
    usable: (TikTokShopResult & { sold_count: number; _price: number })[],
    rawCount: number,
  ): ProviderSignals {
    const withGmv = usable.map(r => ({ ...r, _gmv: r.sold_count * r._price }))

    const soldCountTotal = withGmv.reduce((s, r) => s + r.sold_count, 0)
    const gmvTotal        = withGmv.reduce((s, r) => s + r._gmv, 0)
    const avgPrice         = avg(withGmv.map(r => r._price))

    const topProducts = [...withGmv]
      .sort((a, b) => b._gmv - a._gmv)
      .slice(0, 10)
      .map(r => ({
        title:         r.title?.trim() || 'Untitled product',
        seller_name:   r.seller_name?.trim() || undefined,
        sold_count:    r.sold_count,
        price_usd:     Math.round(r._price * 100) / 100,
        estimated_gmv: Math.round(r._gmv * 100) / 100,
        rank:          typeof r.rank === 'number' ? r.rank : undefined,
      }))

    const social_commerce: SocialCommerceSignal = {
      estimated_gmv_total: Math.round(gmvTotal * 100) / 100,
      sold_count_total:    soldCountTotal,
      sample_size:         withGmv.length,
      methodology:         'derived_sold_count_x_price_lifetime_cumulative',
      data_source:         DATA_SOURCE,
      confidence:           FIXED_CONFIDENCE,
      avg_price_usd:        avgPrice !== null ? Math.round(avgPrice * 100) / 100 : undefined,
      top_products:         topProducts.length ? topProducts : undefined,
    }

    console.log('Apify tiktok-shop-search-scraper signals computed', {
      total_results:      rawCount,
      usable_results:      withGmv.length,
      estimated_gmv_total: social_commerce.estimated_gmv_total,
      sold_count_total:    soldCountTotal,
      confidence:          Math.round(FIXED_CONFIDENCE * 100) + '%',
    })

    return {
      social_commerce,
      provider:   this.name,
      fetched_at: new Date().toISOString(),
      confidence: FIXED_CONFIDENCE,
    }
  }
}
