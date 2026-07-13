import type {
  SignalProvider,
  SignalContext,
  ProviderSignals,
  ViralitySignal,
} from '../types'

// ── Meta Ad Library data via Apify (replaces the direct Meta Graph API) ────
//
// ── WHY THIS PROVIDER NO LONGER CALLS META DIRECTLY (2026-07-13) ──────────
// A real META_ADS_ACCESS_TOKEN was live-verified end-to-end against Meta's
// own ads_archive endpoint, including a full /debug_token + /me/permissions
// inspection proving ads_read and business_management were genuinely
// granted. The request still failed: OAuthException code 10 / subcode
// 2332002. Root cause, confirmed directly against Meta's own current
// transparency.meta.com pages (not archived docs, not blog summaries):
// Meta's Ad Library API is scoped ONLY to "ads about social issues,
// elections or politics" — quoted verbatim from Meta's own current
// description of the product. General commercial ads (this provider's
// actual use case — supplement/beauty/fitness/consumer-goods marketing
// intensity) are out of scope for that API entirely, for any app type,
// use case, or verification level. There was no missing setup step.
//
// Replacement: the Apify `apify/facebook-ads-scraper` actor, which scrapes
// the *public* Meta Ad Library website (facebook.com/ads/library) rather
// than calling the restricted API. This is on solid legal footing: Meta v.
// Bright Data (N.D. Cal., Jan 23 2024) held that Meta's Terms do not bar
// logged-out scraping of public data, and Meta dropped the underlying suit
// rather than appeal. Reuses APIFY_API_TOKEN — the same credential already
// funding lib/signal-engine/providers/competition.ts (junglee/amazon-crawler)
// and the Manufacturing Intelligence tab (Alibaba) — no new credential, no
// new billing relationship.
//
// ── NOT LIVE-VERIFIED — field names built from documented/observed actor
// output, not a live run (Apify credits were exhausted at implementation
// time, per explicit instruction not to spend them here). Defensive parsing
// throughout: an unexpected shape degrades to fewer populated fields or an
// honest null, never a crash or a fabricated value. The exact field names
// below (adArchiveID, pageID/pageId, pageName, startDate/startDateFormatted,
// endDate/endDateFormatted, publisherPlatform) should be spot-checked
// against a real response the first time this runs live, the same
// convention this file already used for the original Meta API integration
// before ITS field names were confirmed.
//
// ── What this provider measures ────────────────────────────────────────
//   ad_count          — real count of ads matching search_terms in the
//                        returned page (bounded by `limit` — see below,
//                        NOT necessarily the true total; reported honestly
//                        as a floor, never inflated).
//   advertiser_count  — distinct page_id values among those ads — a real,
//                        derived count of how many different advertisers
//                        are running product ads in this category.
//   active_ad_pct     — fraction of returned ads with no ad_delivery_stop_time
//                        (or a future one) — sustained current ad spend vs.
//                        one-off/expired campaigns.
//   earliest_ad_start / latest_ad_start — real min/max ad_delivery_start_time
//                        across the fetched page, surfaced as-is.
//   recent_ad_start_pct — fraction of fetched ads whose start date falls in
//                        the last 90 days. NOT a true "count 90 days ago vs
//                        now" delta — that needs two requests separated by
//                        real time, and this provider makes one point-in-
//                        time request per analysis with no persistence
//                        layer behind it. This is the closest honest,
//                        single-request proxy: how much of TODAY's ad
//                        activity is newly launched.
//   avg_active_ad_age_days — for ads still running: now − start, averaged.
//                        Real elapsed time, not total lifespan (they
//                        haven't stopped yet).
//   avg_concluded_ad_duration_days — for ads that have already stopped:
//                        stop − start, averaged. Real total campaign
//                        lifespan — "creative longevity" — but only for the
//                        subset that has actually concluded; kept separate
//                        from avg_active_ad_age_days rather than blended,
//                        because averaging "still running" with "already
//                        over" durations would imply a precision neither
//                        measurement alone has.
//
// Revealed economic preference: sustained ad spend on a niche means someone
// believes their unit economics work — a real, independent (paid-media)
// corroboration of demand, distinct from Amazon/search/social signals.
//
// ── What this provider CANNOT measure ──────────────────────────────────
//   - Actual ad spend / budget — not requested from the actor (the
//     enrichWithEcommerceData / isDetailsPerAd options that surface spend
//     estimates are paid add-ons this provider deliberately does not
//     enable, matching the cost/scope this provider always had).
//   - True total ad count beyond one page — a full historical count would
//     require paginating every result, which this provider does not do
//     (cost/latency tradeoff, matching the single-page-fetch pattern
//     already used elsewhere in this codebase).
//   - A true 90-day count delta — see recent_ad_start_pct above.
//   → All three are left absent/proxied rather than estimated.
//
// ── Data quality gate ───────────────────────────────────────────────────
//   Requires ad_count >= MIN_AD_SAMPLE (3) — a 1–2 ad match is too thin to
//   trust as a category signal and returns null rather than a shaky score,
//   matching the minimum-sample-gate convention used elsewhere in this
//   codebase (e.g. lib/scoring.ts's REVIEW_MOAT_MIN_REVIEWS).

// junglee~amazon-crawler in providers/competition.ts is this same actor
// family's sibling — same run-sync-get-dataset-items call shape, same
// APIFY_API_TOKEN, same timeout reasoning (see fetchAds below).
const ACTOR_ENDPOINT = 'https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items'
export const MIN_AD_SAMPLE = 3
export const PAGE_LIMIT = 100

// Internal normalized shape — unchanged from the original Meta API
// integration. Every pure function below (computeAdStartRange,
// computeRecentAdStartPct, computeAdDurations, computeSignals) operates on
// this shape and required zero changes for the Apify migration; only
// normalizeApifyAd (below) and fetchAds (in the class) had to change to
// populate it from a different source.
interface MetaAd {
  id?: string
  page_id?: string
  page_name?: string
  ad_delivery_start_time?: string
  ad_delivery_stop_time?: string
  publisher_platforms?: string[]
}

// Raw Apify dataset item shape — NOT LIVE-VERIFIED, see file header.
// Multiple plausible field-name variants are checked defensively per field
// since the exact casing/naming was not confirmed against a live response.
interface ApifyFacebookAd {
  adArchiveID?: string
  ad_archive_id?: string
  id?: string
  pageID?: string
  pageId?: string
  page_id?: string
  pageName?: string
  page_name?: string
  startDate?: number | string
  startDateFormatted?: string
  start_date?: number | string
  endDate?: number | string
  endDateFormatted?: string
  end_date?: number | string
  publisherPlatform?: string[]
  publisher_platform?: string[]
}

// Apify/Meta unix timestamps observed in the wild are seconds, not
// milliseconds — a value above 1e12 is treated as already-milliseconds
// defensively (never misinterprets either scale). Returns undefined
// (absence, not a fabricated date) for anything unparseable.
function parseApifyDate(value: number | string | undefined): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const ms = typeof value === 'number' ? (value > 1e12 ? value : value * 1000) : Date.parse(value)
  if (isNaN(ms)) return undefined
  return new Date(ms).toISOString()
}

// Maps one raw Apify dataset item onto the same internal MetaAd shape the
// original Meta API integration always produced — this is the entire
// surface area the Apify migration touches; every computation downstream
// is unaware of where the data came from.
export function normalizeApifyAd(raw: ApifyFacebookAd): MetaAd {
  return {
    id:                     raw.adArchiveID ?? raw.ad_archive_id ?? raw.id,
    page_id:                raw.pageID ?? raw.pageId ?? raw.page_id,
    page_name:              raw.pageName ?? raw.page_name,
    ad_delivery_start_time: parseApifyDate(raw.startDateFormatted ?? raw.startDate ?? raw.start_date),
    ad_delivery_stop_time:  parseApifyDate(raw.endDateFormatted ?? raw.endDate ?? raw.end_date),
    publisher_platforms:    raw.publisherPlatform ?? raw.publisher_platform,
  }
}

// ── Signal scoring ──────────────────────────────────────────────────────

export function adCountToMetaSignal(adCount: number): 'High' | 'Medium' | 'Low' {
  if (adCount >= 200) return 'High'
  if (adCount >= 50)  return 'Medium'
  return 'Low'
}

// Composite 0–10 score: 60% ad count (log-scaled, saturating at the page
// cap) + 40% advertiser diversity — many distinct advertisers spending on
// a category is a stronger economic signal than one advertiser running
// many ad variants.
export function metaScore(adCount: number, advertiserCount: number): number {
  const adScore = adCount <= 0 ? 0
    : Math.min(10, Math.round((Math.log10(adCount) / Math.log10(PAGE_LIMIT)) * 10))
  const advertiserScore =
    advertiserCount >= 40 ? 10 :
    advertiserCount >= 20 ? 8 :
    advertiserCount >= 10 ? 6 :
    advertiserCount >=  5 ? 4 : 2
  return Math.round(adScore * 0.6 + advertiserScore * 0.4)
}

// Confidence tiered by sample size — a full page (100 ads, the query is
// clearly saturating the endpoint) is more trustworthy than a thin 3-4 ad
// match near the minimum gate.
export function dataConfidence(adCount: number): number {
  if (adCount >= PAGE_LIMIT)    return 0.75  // hit the page cap — real total is ≥ this
  if (adCount >= 50)            return 0.68
  if (adCount >= 20)            return 0.60
  if (adCount >= MIN_AD_SAMPLE) return 0.50
  return 0.40
}

const DAY_MS = 24 * 60 * 60 * 1000
const NINETY_DAYS_MS = 90 * DAY_MS

// Real min/max ad_delivery_start_time across the page — undefined when no
// ad in the page has a parseable start date (never fabricated).
export function computeAdStartRange(ads: MetaAd[]): { earliest?: string; latest?: string } {
  const starts = ads
    .map(a => a.ad_delivery_start_time)
    .filter((s): s is string => !!s && !isNaN(Date.parse(s)))
  if (starts.length === 0) return {}
  const sorted = [...starts].sort()
  return { earliest: sorted[0], latest: sorted[sorted.length - 1] }
}

// Fraction of ads with a parseable start date that started within the last
// 90 days (relative to `now`, injectable for deterministic testing).
// undefined when no ad has a parseable start date — absence, not zero.
export function computeRecentAdStartPct(ads: MetaAd[], now: number): number | undefined {
  const withStart = ads
    .map(a => a.ad_delivery_start_time)
    .filter((s): s is string => !!s && !isNaN(Date.parse(s)))
  if (withStart.length === 0) return undefined
  const recent = withStart.filter(s => now - Date.parse(s) <= NINETY_DAYS_MS)
  return Math.round((recent.length / withStart.length) * 100) / 100
}

// Two separate averages, never blended — see header comment for why.
export function computeAdDurations(
  ads: MetaAd[],
  now: number,
): { avgActiveAgeDays?: number; avgConcludedDurationDays?: number } {
  const activeAges: number[] = []
  const concludedDurations: number[] = []

  for (const ad of ads) {
    const start = ad.ad_delivery_start_time ? Date.parse(ad.ad_delivery_start_time) : NaN
    if (isNaN(start)) continue

    const stop = ad.ad_delivery_stop_time ? Date.parse(ad.ad_delivery_stop_time) : NaN
    const isStopped = !isNaN(stop) && stop <= now

    if (isStopped) {
      concludedDurations.push((stop - start) / DAY_MS)
    } else {
      activeAges.push((now - start) / DAY_MS)
    }
  }

  const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined
  const round1 = (n: number | undefined) => n === undefined ? undefined : Math.round(n * 10) / 10

  return {
    avgActiveAgeDays:         round1(avg(activeAges)),
    avgConcludedDurationDays: round1(avg(concludedDurations)),
  }
}

// ── Core provider class ──────────────────────────────────────────────────

export class MetaAdsProvider implements SignalProvider {
  readonly name    = 'meta-ads'
  readonly enabled = !!process.env.APIFY_API_TOKEN

  async fetch(ctx: SignalContext): Promise<ProviderSignals | null> {
    if (!this.enabled) return null

    const query = ctx.query.trim()
    if (!query) return null

    try {
      const rawAds = await this.fetchAds(query)
      if (!rawAds || rawAds.length < MIN_AD_SAMPLE) {
        console.log('Meta Ads: below minimum sample', { query, found: rawAds?.length ?? 0, min: MIN_AD_SAMPLE })
        return null
      }
      const ads = rawAds.map(normalizeApifyAd)
      return this.computeSignals(query, ads)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('Meta Ads provider error', { query, error: msg.slice(0, 120) })
      return null
    }
  }

  // ── Private: build a public Ad Library search URL for this query ───────
  // Standard, stable, publicly-documented Ad Library website URL shape —
  // this is the same URL a person would visit manually; the actor scrapes
  // whatever it renders. active_status=all (not just "active") matches the
  // original provider's ad_active_status=ALL — we compute active_ad_pct
  // ourselves from the returned dates rather than pre-filtering.

  private buildSearchUrl(query: string): string {
    const params = new URLSearchParams({
      active_status: 'all',
      ad_type:       'all',
      country:       'US',
      q:             query,
      search_type:   'keyword_unordered',
      media_type:    'all',
    })
    return `https://www.facebook.com/ads/library/?${params.toString()}`
  }

  // ── Private: run the Apify actor synchronously, get dataset items ──────
  // Same run-sync-get-dataset-items call shape as providers/competition.ts's
  // junglee/amazon-crawler: actor-side timeout=90 plus a client-side
  // AbortSignal just above it, both kept under the signal engine's shared
  // 75_000ms race in app/api/generate/route.ts so that shared race — not
  // this abort — is what actually governs on a slow run.

  private async fetchAds(query: string): Promise<ApifyFacebookAd[] | null> {
    const token = process.env.APIFY_API_TOKEN
    if (!token) return null

    let res: Response
    try {
      res = await fetch(`${ACTOR_ENDPOINT}?timeout=90`, {
        method:  'POST',
        signal:  AbortSignal.timeout(80_000),
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          startUrls:    [{ url: this.buildSearchUrl(query) }],
          resultsLimit: PAGE_LIMIT,
        }),
      })
    } catch { return null }

    if (!res.ok) {
      console.log('Meta Ads (Apify): non-OK response', { query, status: res.status })
      return null
    }

    let items: unknown
    try { items = await res.json() } catch { return null }

    if (!Array.isArray(items)) {
      console.log('Meta Ads (Apify): unexpected response shape (not an array)', { query })
      return null
    }
    return items as ApifyFacebookAd[]
  }

  // ── Private: compute signals ─────────────────────────────────────────

  private computeSignals(query: string, ads: MetaAd[]): ProviderSignals {
    const adCount = ads.length

    const advertisers = new Set(ads.map(a => a.page_id).filter((id): id is string => !!id))
    const advertiserCount = advertisers.size

    const now = Date.now()
    const activeAds = ads.filter(a => {
      if (!a.ad_delivery_stop_time) return true // no stop time = still running
      const stop = Date.parse(a.ad_delivery_stop_time)
      return !isNaN(stop) && stop > now
    })
    const activeAdPct = adCount > 0 ? Math.round((activeAds.length / adCount) * 100) / 100 : 0

    const score      = metaScore(adCount, advertiserCount)
    const metaSignal = adCountToMetaSignal(adCount)
    const confidence = dataConfidence(adCount)

    const { earliest, latest }              = computeAdStartRange(ads)
    const recentAdStartPct                  = computeRecentAdStartPct(ads, now)
    const { avgActiveAgeDays, avgConcludedDurationDays } = computeAdDurations(ads, now)

    console.log('Meta Ads signals computed', {
      query,
      ad_count:          adCount,          // real, bounded by PAGE_LIMIT — see header comment
      advertiser_count:  advertiserCount,  // real, distinct page_id values
      active_ad_pct:     `${Math.round(activeAdPct * 100)}%`,
      earliest_ad_start: earliest ?? null,
      latest_ad_start:   latest ?? null,
      recent_ad_start_pct: recentAdStartPct !== undefined ? `${Math.round(recentAdStartPct * 100)}%` : null,
      avg_active_ad_age_days: avgActiveAgeDays ?? null,
      avg_concluded_ad_duration_days: avgConcludedDurationDays ?? null,
      score,
      meta_signal:       metaSignal,
      confidence:        Math.round(confidence * 100) + '%',
      not_measured:      ['ad_spend', 'true_total_ad_count_beyond_one_page', 'true_90_day_count_delta'],
    })

    const virality: ViralitySignal = {
      score,
      confidence,
      meta_signal:      metaSignal,
      ad_count:         adCount,
      advertiser_count: advertiserCount,
      active_ad_pct:    activeAdPct,
      earliest_ad_start: earliest,
      latest_ad_start:   latest,
      recent_ad_start_pct: recentAdStartPct,
      avg_active_ad_age_days: avgActiveAgeDays,
      avg_concluded_ad_duration_days: avgConcludedDurationDays,
    }

    return {
      virality,
      provider:   'meta-ads',
      fetched_at: new Date().toISOString(),
      confidence,
    }
  }
}
