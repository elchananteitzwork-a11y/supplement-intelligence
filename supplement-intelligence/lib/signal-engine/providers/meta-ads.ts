import type {
  SignalProvider,
  SignalContext,
  ProviderSignals,
  ViralitySignal,
} from '../types'

// ── Meta Ad Library API (public archive, requires an access token) ────────
//
// Endpoint:
//   GET https://graph.facebook.com/{API_VERSION}/ads_archive
//       ?access_token={token}
//       &search_terms={query}
//       &ad_reached_countries=["US"]
//       &ad_type=ALL
//       &ad_active_status=ALL
//       &fields=id,page_id,page_name,ad_delivery_start_time,ad_delivery_stop_time,publisher_platforms
//       &limit=100
//
// Token: an App Access Token (`{app-id}|{app-secret}`) or long-lived user
// token with ads_read scope, set as META_ADS_ACCESS_TOKEN. Requires the
// owning Meta Developer App to have completed identity verification for
// Ad Library API access — a one-time real-world setup step, not a code
// concern. Until that env var is set, this provider stays enabled=false
// and never fires, exactly like the tiktok/reddit providers before their
// credentials exist.
//
// ── IMPORTANT — not live-verified in this environment ─────────────────────
// Unlike tiktok.ts (whose field names carry "CONFIRMED VIA LIVE CALL" dates
// because they were checked against a live response), this implementation
// is written directly from Meta's publicly documented Ad Library API
// contract only. No network access was available to verify the exact
// response shape live. Parsing below is deliberately defensive — any
// unexpected shape (missing fields, empty array, non-200 status) returns
// null rather than guessing — but the field names themselves (id, page_id,
// page_name, ad_delivery_start_time, ad_delivery_stop_time) should be spot-
// checked against a real response the first time META_ADS_ACCESS_TOKEN is
// configured, the same way tiktok.ts's fields were originally confirmed.
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
//
// Revealed economic preference: sustained ad spend on a niche means someone
// believes their unit economics work — a real, independent (paid-media)
// corroboration of demand, distinct from Amazon/search/social signals.
//
// ── What this provider CANNOT measure ──────────────────────────────────
//   - Actual ad spend / budget — Meta does not expose this for non-
//     political ads via this endpoint.
//   - True total ad count beyond one page — a full historical count would
//     require paginating every result, which this provider does not do
//     (cost/latency tradeoff, matching the single-page-fetch pattern
//     already used elsewhere in this codebase).
//   → Both are left absent rather than estimated.
//
// ── Data quality gate ───────────────────────────────────────────────────
//   Requires ad_count >= MIN_AD_SAMPLE (3) — a 1–2 ad match is too thin to
//   trust as a category signal and returns null rather than a shaky score,
//   matching the minimum-sample-gate convention used elsewhere in this
//   codebase (e.g. lib/scoring.ts's REVIEW_MOAT_MIN_REVIEWS).

const API_VERSION = 'v21.0'
const BASE_URL = `https://graph.facebook.com/${API_VERSION}/ads_archive`
export const MIN_AD_SAMPLE = 3
export const PAGE_LIMIT = 100

interface MetaAd {
  id?: string
  page_id?: string
  page_name?: string
  ad_delivery_start_time?: string
  ad_delivery_stop_time?: string
  publisher_platforms?: string[]
}

interface MetaAdsArchiveResponse {
  data?: MetaAd[]
  error?: { message?: string; code?: number }
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

// ── Core provider class ──────────────────────────────────────────────────

export class MetaAdsProvider implements SignalProvider {
  readonly name    = 'meta-ads'
  readonly enabled = !!process.env.META_ADS_ACCESS_TOKEN

  async fetch(ctx: SignalContext): Promise<ProviderSignals | null> {
    const token = process.env.META_ADS_ACCESS_TOKEN
    if (!token) return null

    const query = ctx.query.trim()
    if (!query) return null

    try {
      const ads = await this.fetchAds(query, token)
      if (!ads || ads.length < MIN_AD_SAMPLE) {
        console.log('Meta Ads: below minimum sample', { query, found: ads?.length ?? 0, min: MIN_AD_SAMPLE })
        return null
      }
      return this.computeSignals(query, ads)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('Meta Ads provider error', { query, error: msg.slice(0, 120) })
      return null
    }
  }

  // ── Private: single search-terms fetch ─────────────────────────────────

  private async fetchAds(query: string, token: string): Promise<MetaAd[] | null> {
    const params = new URLSearchParams({
      access_token: token,
      search_terms: query,
      ad_reached_countries: JSON.stringify(['US']),
      ad_type: 'ALL',
      ad_active_status: 'ALL',
      fields: 'id,page_id,page_name,ad_delivery_start_time,ad_delivery_stop_time,publisher_platforms',
      limit: String(PAGE_LIMIT),
    })

    let res: Response
    try {
      res = await fetch(`${BASE_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(8_000),
      })
    } catch { return null }

    if (!res.ok) {
      console.log('Meta Ads: non-OK response', { query, status: res.status })
      return null
    }

    let body: MetaAdsArchiveResponse
    try { body = await res.json() as MetaAdsArchiveResponse } catch { return null }

    if (body.error) {
      console.log('Meta Ads: API error', { query, error: body.error.message })
      return null
    }

    if (!Array.isArray(body.data)) return null
    return body.data
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

    console.log('Meta Ads signals computed', {
      query,
      ad_count:          adCount,          // real, bounded by PAGE_LIMIT — see header comment
      advertiser_count:  advertiserCount,  // real, distinct page_id values
      active_ad_pct:     `${Math.round(activeAdPct * 100)}%`,
      score,
      meta_signal:       metaSignal,
      confidence:        Math.round(confidence * 100) + '%',
      not_measured:      ['ad_spend', 'true_total_ad_count_beyond_one_page'],
    })

    const virality: ViralitySignal = {
      score,
      confidence,
      meta_signal:      metaSignal,
      ad_count:         adCount,
      advertiser_count: advertiserCount,
      active_ad_pct:    activeAdPct,
    }

    return {
      virality,
      provider:   'meta-ads',
      fetched_at: new Date().toISOString(),
      confidence,
    }
  }
}
