import type { ReviewProvider, ProviderPage, ProviderFetchOptions } from './types'
import type { CollectedReview } from '../types'
import { RateLimiter } from '../rate-limiter'
import { RetryableError, NonRetryableError, httpError } from '../retry'

// ── Rainforest API ─────────────────────────────────────────────────────────
// Real-time Amazon data via Rainforest API (rainforestapi.com).
// Handles auth, pagination, and normalisation of the raw response.
//
// Required: RAINFOREST_API_KEY in environment.
// Rate limit: 60 requests/minute on most plans (we use 0.8 req/s to stay safe).
// Docs: https://www.rainforestapi.com/docs/product-data-api/reference/reviews

const RAINFOREST_ENDPOINT = 'https://api.rainforestapi.com/request'

// ── Raw API shapes ─────────────────────────────────────────────────────────

interface RainforestDate {
  raw?: string
  utc?: string
}

interface RainforestAttribute {
  name:  string
  value: string
}

interface RainforestProfile {
  name?: string
}

interface RainforestReview {
  id:                 string
  title?:             string
  body?:              string
  rating?:            number
  date?:              RainforestDate
  verified_purchase?: boolean
  helpful_votes?:     number
  vine_program?:      boolean
  attributes?:        RainforestAttribute[]
  review_country?:    string   // e.g. "United States"
  profile?:           RainforestProfile
}

interface RainforestPagination {
  current_page?: number
  total_pages?:  number
}

interface RainforestRequestInfo {
  success?: boolean
  message?: string
  credits_used?: number
}

interface RainforestResponse {
  request_info?: RainforestRequestInfo
  reviews?:      RainforestReview[]
  pagination?:   RainforestPagination
}

// ── Mapping tables ─────────────────────────────────────────────────────────

const SORT_MAP: Record<string, string> = {
  helpful:   'helpful',
  recent:    'recent',
  top_rated: 'top_reviews',
}

const DOMAIN_MAP: Record<string, string> = {
  US: 'amazon.com',
  GB: 'amazon.co.uk',
  CA: 'amazon.ca',
  AU: 'amazon.com.au',
  DE: 'amazon.de',
  FR: 'amazon.fr',
  IT: 'amazon.it',
  ES: 'amazon.es',
  JP: 'amazon.co.jp',
  MX: 'amazon.com.mx',
  IN: 'amazon.in',
}

const COUNTRY_NAME_MAP: Record<string, string> = {
  'United States':  'US',
  'United Kingdom': 'GB',
  'Canada':         'CA',
  'Australia':      'AU',
  'Germany':        'DE',
  'France':         'FR',
  'Italy':          'IT',
  'Spain':          'ES',
  'Japan':          'JP',
  'Mexico':         'MX',
  'India':          'IN',
}

// ── Provider ───────────────────────────────────────────────────────────────

export class RainforestProvider implements ReviewProvider {
  readonly name     = 'rainforest'
  readonly enabled  = !!process.env.RAINFOREST_API_KEY
  readonly priority = 1   // highest priority; try first

  private apiKey:  string
  // Conservative: 0.8 req/s well under the 60/min plan cap
  private limiter: RateLimiter = new RateLimiter({ rate: 0.8, burst: 3 })

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.RAINFOREST_API_KEY ?? ''
  }

  async fetchPage(
    asin:    string,
    page:    number,
    options: ProviderFetchOptions,
  ): Promise<ProviderPage> {
    if (!this.enabled) throw new NonRetryableError('Rainforest: RAINFOREST_API_KEY not set')

    await this.limiter.acquire()

    const params = new URLSearchParams({
      api_key:       this.apiKey,
      type:          'reviews',
      asin,
      amazon_domain: DOMAIN_MAP[options.country] ?? 'amazon.com',
      sort_by:       SORT_MAP[options.sort_by]    ?? 'helpful',
      page:          String(page),
    })

    if (options.verified_only) params.set('reviewer_type', 'avp_only_reviews')

    if (options.min_rating !== undefined && options.min_rating === options.max_rating) {
      // Rainforest only supports single-star filters
      const starNames: Record<number, string> = {
        1: 'one_star', 2: 'two_star', 3: 'three_star', 4: 'four_star', 5: 'five_star',
      }
      const name = starNames[options.min_rating]
      if (name) params.set('filter_by_star', name)
    }

    const url = `${RAINFOREST_ENDPOINT}?${params}`
    let res: Response

    try {
      res = await fetch(url, {
        signal:  AbortSignal.timeout(options.timeout_ms),
        headers: { Accept: 'application/json' },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new RetryableError(`Rainforest fetch failed: ${msg}`)
    }

    if (!res.ok) {
      const err = await httpError(res)
      if (err.status === 429) this.limiter.release()
      throw err
    }

    let data: RainforestResponse
    try { data = await res.json() as RainforestResponse } catch {
      throw new RetryableError('Rainforest: malformed JSON response')
    }

    if (data.request_info && data.request_info.success === false) {
      throw new NonRetryableError(`Rainforest: ${data.request_info.message ?? 'request failed'}`)
    }

    const currentPage = data.pagination?.current_page ?? page
    const totalPages  = data.pagination?.total_pages   ?? 1
    const reviews     = (data.reviews ?? []).map(r => this.normalise(r, asin))

    console.log(`[Rainforest] page ${currentPage}/${totalPages}`, {
      asin,
      reviews:       reviews.length,
      credits_used:  data.request_info?.credits_used,
    })

    return {
      reviews,
      has_next:   currentPage < totalPages,
      next_page:  currentPage < totalPages ? currentPage + 1 : undefined,
    }
  }

  // ── Normalisation ────────────────────────────────────────────────────────

  private normalise(r: RainforestReview, asin: string): CollectedReview {
    const countryName = r.review_country ?? ''
    const country     = COUNTRY_NAME_MAP[countryName]
      ?? (countryName.length === 2 ? countryName.toUpperCase() : 'US')

    const variation = r.attributes?.length
      ? r.attributes.map(a => `${a.name}: ${a.value}`).join(' | ')
      : undefined

    const date = r.date?.utc
      ? safeIso(r.date.utc)
      : r.date?.raw
        ? parseDateString(r.date.raw)
        : new Date().toISOString()

    return {
      id:              r.id,
      asin,
      title:           (r.title ?? '').trim(),
      body:            (r.body  ?? '').trim(),
      rating:          clampRating(r.rating ?? 0),
      verified:        r.verified_purchase ?? false,
      date,
      helpful_votes:   r.helpful_votes ?? 0,
      variation,
      country,
      reviewer_name:   r.profile?.name ?? undefined,
      source_provider: 'rainforest',
      collected_at:    new Date().toISOString(),
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function clampRating(r: number): number {
  return Math.min(5, Math.max(1, Math.round(r)))
}

function safeIso(raw: string): string {
  try   { return new Date(raw).toISOString() }
  catch { return new Date().toISOString() }
}

function parseDateString(raw: string): string {
  // Rainforest may return "January 1, 2024" or "1 January 2024"
  try   { return new Date(raw).toISOString() }
  catch { return new Date().toISOString() }
}
