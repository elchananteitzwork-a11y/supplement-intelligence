import type { NewsProvider, NewsContext, NewsItem } from '../types'
import { toSearchKeyword } from '../keyword'
import { cacheGet, cacheSet } from '../cache'
import { categorizeHeadline, newsRelevanceConfidence } from '../categorize'

// ── GDELT DOC 2.0 API — broad real-time global news search ──────────────────
// Free, open data project (https://www.gdeltproject.org/about.html), no API
// key, no commercial-use restriction — built for exactly this kind of
// programmatic monitoring. Returns real, direct article URLs (not a proxy/
// redirect link). Covers product launches, industry news, competitor
// announcements, funding/M&A coverage that gets picked up by mainstream or
// trade press. Applies to all 5 categories.
//
// Hard constraint: GDELT enforces a global 1-request-per-5-seconds rate
// limit and returns a plain-text rate-limit message (not JSON, not an HTTP
// error code) when exceeded — handled below by treating a JSON-parse
// failure as a soft "no results this time," never a thrown error.

const GDELT_API = 'https://api.gdeltproject.org/api/v2/doc/doc'
const CACHE_TTL_MS = 4 * 60 * 60 * 1000

interface GdeltArticle {
  url:      string
  title:    string
  seendate: string   // "20260514T120000Z"
  domain:   string
}
interface GdeltResponse { articles?: GdeltArticle[] }

function parseGdeltDate(seendate: string): string | null {
  // "20260514T120000Z" -> "2026-05-14T12:00:00Z"
  const m = seendate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`
  const date = new Date(iso)
  return isNaN(date.getTime()) ? null : date.toISOString()
}

export class GdeltProvider implements NewsProvider {
  readonly name    = 'gdelt'
  readonly enabled = process.env.GDELT_DISABLED !== 'true'

  async fetch(ctx: NewsContext): Promise<NewsItem[]> {
    const keyword = toSearchKeyword(ctx.query)
    if (!keyword) return []

    const cacheKey = `gdelt:${keyword}:${ctx.windowDays}`
    const cached = cacheGet<NewsItem[]>(cacheKey)
    if (cached) return cached

    try {
      const query = `${keyword} sourcelang:english`
      const url = `${GDELT_API}?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=10&format=json&timespan=${ctx.windowDays}d`
      const res = await fetch(url, { signal: AbortSignal.timeout(13_000) })
      if (!res.ok) { cacheSet(cacheKey, [], CACHE_TTL_MS); return [] }

      const text = await res.text()
      let data: GdeltResponse
      try {
        data = JSON.parse(text)
      } catch {
        // Rate-limited or malformed — GDELT returns a plain-text message,
        // not JSON, in this case. Soft-fail, don't cache (so the next
        // request — likely past the 5s window — can try fresh).
        if (text.toLowerCase().includes('limit')) {
          console.warn('[GDELT] rate-limited, skipping this request')
        }
        return []
      }

      const items: NewsItem[] = (data.articles ?? [])
        .map((a, i): NewsItem | null => {
          const date = parseGdeltDate(a.seendate)
          if (!date || !a.url || !a.title) return null
          return {
            id:         `gdelt-${i}`,
            headline:   a.title,
            date,
            source:     a.domain,
            url:        a.url,
            category:   categorizeHeadline(a.title),
            confidence: newsRelevanceConfidence(ctx.query, a.title),
            provider:   'gdelt',
          }
        })
        .filter((x): x is NewsItem => x !== null)

      cacheSet(cacheKey, items, CACHE_TTL_MS)
      return items
    } catch (e: unknown) {
      console.warn('[GDELT] fetch failed', { keyword, error: e instanceof Error ? e.message : e })
      return []
    }
  }
}
