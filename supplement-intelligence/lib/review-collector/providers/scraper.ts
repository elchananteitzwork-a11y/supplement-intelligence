import type { ReviewProvider, ProviderPage, ProviderFetchOptions } from './types'
import type { CollectedReview } from '../types'
import { RateLimiter } from '../rate-limiter'
import { RetryableError, NonRetryableError, sleep } from '../retry'

// ── Amazon review page scraper ─────────────────────────────────────────────
//
// Best-effort fallback provider. Uses Amazon's public product-reviews pages.
// Parses reviews by targeting `data-hook` attributes, which are Amazon's own
// test markers and change far less often than layout class names.
//
// Limitations:
//   - Amazon actively blocks bot traffic; success is not guaranteed.
//   - Captcha pages or Geoblocks are detected and returned as empty (not thrown).
//   - Rate-limited to ≤0.25 req/s (~15/min) to minimise detection risk.
//   - No session or cookie management — stateless requests only.
//
// This provider is always "enabled" (no API key required), but callers should
// treat its results as supplemental and expect partial data.

// ── Amazon marketplace domains ─────────────────────────────────────────────

const AMAZON_DOMAINS: Record<string, string> = {
  US: 'www.amazon.com',
  GB: 'www.amazon.co.uk',
  CA: 'www.amazon.ca',
  AU: 'www.amazon.com.au',
  DE: 'www.amazon.de',
  FR: 'www.amazon.fr',
  IT: 'www.amazon.it',
  ES: 'www.amazon.es',
  JP: 'www.amazon.co.jp',
  MX: 'www.amazon.com.mx',
  IN: 'www.amazon.in',
}

// ── Sort param values ──────────────────────────────────────────────────────

const SORT_PARAM: Record<string, string> = {
  helpful:   'helpful',
  recent:    'recent',
  top_rated: 'top_reviews',
}

// ── Reviewer type param ────────────────────────────────────────────────────

const REVIEWER_TYPE_ALL        = 'all_reviews'
const REVIEWER_TYPE_VERIFIED   = 'avp_only_reviews'

// ── Star filter params ─────────────────────────────────────────────────────

const STAR_FILTER: Record<number, string> = {
  1: 'one_star', 2: 'two_star', 3: 'three_star', 4: 'four_star', 5: 'five_star',
}

// ── Country name → ISO code ────────────────────────────────────────────────

const COUNTRY_MAP: Record<string, string> = {
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

// ── Browser User-Agent pool ────────────────────────────────────────────────
// Rotated per-request to reduce fingerprinting.

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
] as const

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

// ── Detection guards ───────────────────────────────────────────────────────

function isBlockPage(html: string): boolean {
  return (
    html.includes('data-hook="captcha"')     ||
    html.includes('validateCaptcha')          ||
    html.includes('Robot Check')              ||
    html.includes('api-services-support@amazon.com') ||
    // "There was a problem" / sign-in wall
    html.includes('Sorry, we just need to make sure') ||
    html.includes('data-hook="signin-widget"')
  )
}

function isNoReviewsPage(html: string): boolean {
  return html.includes('data-hook="cr-filter-info-section"') &&
    !html.includes('data-hook="review"')
}

// ── HTML review parser ─────────────────────────────────────────────────────
//
// Strategy: find every review container by the `data-hook="review"` attribute,
// then slice the HTML between consecutive containers to get each review block.
// Extract fields using targeted regexes against stable data-hook anchors.
//
// Key assumption: Amazon's data-hooks are internal test markers they maintain
// for their own automated testing — they change far less often than CSS classes.

const REVIEW_OPEN_RE = /<div[^>]+data-hook="review"[^>]+id="([^"]+)"/g

function parseReviewsFromHtml(html: string, asin: string, source: string): CollectedReview[] {
  if (isBlockPage(html) || isNoReviewsPage(html)) return []

  // Find start positions of all review divs
  const positions: Array<{ id: string; start: number }> = []
  REVIEW_OPEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = REVIEW_OPEN_RE.exec(html)) !== null) {
    positions.push({ id: m[1], start: m.index })
  }

  if (!positions.length) return []

  // Slice HTML into per-review blocks
  const reviews: CollectedReview[] = []
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start
    const end   = positions[i + 1]?.start ?? html.length
    const block = html.slice(start, end)
    const review = parseBlock(positions[i].id, block, asin, source)
    if (review) reviews.push(review)
  }
  return reviews
}

function parseBlock(
  id:     string,
  block:  string,
  asin:   string,
  source: string,
): CollectedReview | null {
  const rating = extractRating(block)
  if (rating === 0) return null   // can't trust a review without a rating

  const body = extractBody(block)
  if (!body) return null          // reviews without body text carry no signal

  const dateRaw = extractDateRaw(block)
  const country = extractCountry(dateRaw)

  return {
    id,
    asin,
    title:           extractTitle(block),
    body,
    rating,
    verified:        extractVerified(block),
    date:            parseDateRaw(dateRaw),
    helpful_votes:   extractHelpful(block),
    variation:       extractVariation(block),
    country,
    reviewer_name:   extractReviewerName(block),
    source_provider: source,
    collected_at:    new Date().toISOString(),
  }
}

// ── Field extractors ───────────────────────────────────────────────────────

function extractRating(block: string): number {
  // Primary: "X.0 out of 5 stars" in the alt text of the star icon
  const m1 = block.match(/class="a-icon-alt">([\d.]+) out of 5 stars?<\/span>/)
  if (m1) return clampRating(parseFloat(m1[1]))

  // Fallback: aria-label on the star span
  const m2 = block.match(/aria-label="([\d.]+) out of 5(?: stars?)?"/i)
  if (m2) return clampRating(parseFloat(m2[1]))

  return 0
}

function extractTitle(block: string): string {
  // Find the section enclosed by data-hook="review-title"
  const sectionMatch = block.match(/data-hook="review-title"[\s\S]+?(?=<\/a>|<\/div>)/)
  if (!sectionMatch) return ''
  const section = sectionMatch[0]

  // Collect all <span> text nodes; skip the "X out of 5 stars" icon span
  const spanRe   = /<span[^>]*>([^<]*)<\/span>/g
  const texts: string[] = []
  let sm: RegExpExecArray | null
  while ((sm = spanRe.exec(section)) !== null) {
    const t = sm[1].trim()
    if (t && !t.includes('out of 5 stars') && !t.startsWith('<!--')) texts.push(t)
  }
  return texts.join(' ').trim()
}

function extractBody(block: string): string {
  // data-hook="review-body" contains one or more <span> elements with the text.
  // We take everything between the opening of the hook div and the closing </span>,
  // then strip all HTML tags.
  const m = block.match(/data-hook="review-body"[\s\S]+?<span[^>]*>([\s\S]+?)<\/span>/)
  if (!m) return ''
  return stripHtml(m[1])
}

function extractDateRaw(block: string): string {
  // "Reviewed in the United States on January 1, 2024"
  const m = block.match(/data-hook="review-date"[^>]*>([^<\n]+?)(?:<\/span>|<\/div>)/)
  return m ? m[1].trim() : ''
}

function extractCountry(dateRaw: string): string {
  const m = dateRaw.match(/Reviewed in (.+?) on /i)
  if (!m) return 'US'
  return COUNTRY_MAP[m[1].trim()] ?? 'US'
}

function parseDateRaw(raw: string): string {
  // "Reviewed in the United States on January 1, 2024"
  const m = raw.match(/ on (.+)$/)
  const dateStr = m ? m[1].trim() : raw
  try   { return new Date(dateStr).toISOString() }
  catch { return new Date().toISOString() }
}

function extractVerified(block: string): boolean {
  return block.includes('data-hook="avp-badge"')
}

function extractHelpful(block: string): number {
  // "X people found this helpful" / "One person found this helpful"
  const m1 = block.match(/data-hook="helpful-vote-statement"[\s\S]+?<span[^>]*>([\d,]+) (?:people|person) found/)
  if (m1) return parseInt(m1[1].replace(/,/g, ''), 10)

  const m2 = block.match(/data-hook="helpful-vote-statement"[\s\S]+?<span[^>]*>One person found/)
  if (m2) return 1

  return 0
}

function extractVariation(block: string): string | undefined {
  // Product variation shown as a link or plain text under the review
  const m = block.match(/data-hook="format-strip"[^>]*>([^<]+?)<\//)
  if (!m) {
    // Some layouts use "variant-attribute-display" instead
    const m2 = block.match(/data-hook="variant-attribute-display"[^>]*>[\s\S]*?<span[^>]*>([^<]+?)<\/span>/)
    return m2 ? m2[1].trim().replace(/\s+/g, ' ') : undefined
  }
  return m[1].trim().replace(/\s+/g, ' ') || undefined
}

function extractReviewerName(block: string): string | undefined {
  // Reviewer profile name link or span
  const m = block.match(/class="a-profile-name">([^<]+)<\/span>/)
  return m ? m[1].trim() : undefined
}

// ── HTML pagination detection ──────────────────────────────────────────────

function hasNextPage(html: string): boolean {
  // Amazon marks the "Next page" button with class="a-last".
  // When on the last page the anchor is absent or the li has "a-disabled".
  if (/class="a-last a-disabled"|class="a-disabled a-last"/.test(html)) return false
  const lastLi = html.match(/class="a-last"[^>]*>([\s\S]{0,300}?)<\/li>/)
  if (!lastLi) return false
  return lastLi[1].includes('<a ')
}

// ── HTML utilities ─────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g,    ' ')
    .trim()
}

function clampRating(r: number): number {
  return Math.min(5, Math.max(1, Math.round(r)))
}

// ── Provider class ─────────────────────────────────────────────────────────

export class AmazonScraperProvider implements ReviewProvider {
  readonly name     = 'scraper'
  readonly enabled  = true   // no API key required
  readonly priority = 2      // try after Rainforest

  // Conservative: 1 request per 4 seconds (15/min) to reduce detection risk
  private limiter: RateLimiter = new RateLimiter({ rate: 0.25, burst: 1 })

  async fetchPage(
    asin:    string,
    page:    number,
    options: ProviderFetchOptions,
  ): Promise<ProviderPage> {
    const domain = AMAZON_DOMAINS[options.country] ?? AMAZON_DOMAINS.US!

    const params = new URLSearchParams({
      pageNumber:   String(page),
      sortBy:       SORT_PARAM[options.sort_by] ?? 'helpful',
      reviewerType: options.verified_only ? REVIEWER_TYPE_VERIFIED : REVIEWER_TYPE_ALL,
    })

    // Amazon only supports filtering by a single star rating
    if (
      options.min_rating !== undefined &&
      options.min_rating === options.max_rating &&
      STAR_FILTER[options.min_rating]
    ) {
      params.set('filterByStar', STAR_FILTER[options.min_rating]!)
    }

    const url = `https://${domain}/product-reviews/${encodeURIComponent(asin)}?${params}`

    await this.limiter.acquire()

    let res: Response
    try {
      res = await fetch(url, {
        signal:   AbortSignal.timeout(options.timeout_ms),
        redirect: 'follow',
        headers: {
          'User-Agent':      randomUA(),
          'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control':   'no-cache',
          'Pragma':          'no-cache',
          'Sec-Fetch-Dest':  'document',
          'Sec-Fetch-Mode':  'navigate',
          'Sec-Fetch-Site':  'none',
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('AbortError') || msg.includes('timeout')) {
        throw new RetryableError(`Scraper: request timed out (${options.timeout_ms}ms)`)
      }
      throw new RetryableError(`Scraper: fetch failed — ${msg}`)
    }

    // Amazon returns 503 when rate-limiting scrapers; respect it
    if (res.status === 503 || res.status === 429) {
      this.limiter.release()
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10)
      throw new RetryableError(`Scraper: rate limited (${res.status})`, res.status, retryAfter)
    }

    if (!res.ok) {
      if ([403, 404].includes(res.status)) {
        throw new NonRetryableError(`Scraper: ${res.status} for ASIN ${asin}`, res.status)
      }
      throw new RetryableError(`Scraper: HTTP ${res.status}`, res.status)
    }

    let html: string
    try { html = await res.text() } catch {
      throw new RetryableError('Scraper: failed to read response body')
    }

    // Add a randomised inter-page pause to appear more human-like
    await sleep(500 + Math.random() * 1_000)

    const reviews  = parseReviewsFromHtml(html, asin, this.name)
    const hasNext  = hasNextPage(html)
    const wasBlock = isBlockPage(html)

    if (wasBlock) {
      console.warn(`[Scraper] blocked page detected for ASIN ${asin} page ${page}`)
    } else {
      console.log(`[Scraper] page ${page}`, {
        asin,
        reviews:     reviews.length,
        has_next:    hasNext,
        was_blocked: wasBlock,
      })
    }

    return {
      reviews,
      has_next:   hasNext && !wasBlock,
      next_page:  hasNext && !wasBlock ? page + 1 : undefined,
    }
  }
}
