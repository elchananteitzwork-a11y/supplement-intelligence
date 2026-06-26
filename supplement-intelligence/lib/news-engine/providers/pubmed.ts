import type { NewsProvider, NewsContext, NewsItem } from '../types'
import { toPubMedPhrase } from '../keyword'
import { cacheGet, cacheSet } from '../cache'

// ── PubMed / NCBI E-utilities — recently published scientific studies ───────
// Free, public, explicitly designed for this kind of programmatic access
// (https://www.ncbi.nlm.nih.gov/books/NBK25497/) — no commercial-use
// restriction, no API key required (a free key just raises the rate limit).
// Applies to ingredient/formulation-driven categories where "is there a
// recent clinical study on this" is a meaningful question; skipped for
// "home" goods, which aren't a research literature subject.

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const APPLICABLE_CATEGORIES = new Set(['supplements', 'beauty', 'pets', 'fitness'])
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const NCBI_TOOL = 'supplement-intelligence'

interface EsearchResponse { esearchresult?: { idlist?: string[] } }
interface EsummaryItem { title?: string; sortpubdate?: string; pubdate?: string; source?: string }
interface EsummaryResponse { result?: Record<string, EsummaryItem | string[]> }

function parsePubmedDate(sortpubdate: string | undefined): string | null {
  if (!sortpubdate) return null
  // Format: "2026/06/23 00:00"
  const d = new Date(sortpubdate.replace(' ', 'T').replace(/\//g, '-') + 'Z')
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export class PubMedProvider implements NewsProvider {
  readonly name    = 'pubmed'
  readonly enabled = true

  async fetch(ctx: NewsContext): Promise<NewsItem[]> {
    if (ctx.categoryId && !APPLICABLE_CATEGORIES.has(ctx.categoryId)) return []
    const phrase = toPubMedPhrase(ctx.query)
    if (!phrase) return []

    const cacheKey = `pubmed:${phrase}:${ctx.windowDays}`
    const cached = cacheGet<NewsItem[]>(cacheKey)
    if (cached) return cached

    try {
      // [tiab] (title/abstract) exact-phrase search — see toPubMedPhrase for
      // why this beats both a bare word (domain-ambiguous) and a 3+ word
      // phrase (near-zero results).
      const term = `"${phrase}"[tiab]`
      const searchUrl = `${EUTILS}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=5&retmode=json&datetype=pdat&reldate=${ctx.windowDays}&tool=${NCBI_TOOL}`
      const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10_000) })
      if (!searchRes.ok) { cacheSet(cacheKey, [], CACHE_TTL_MS); return [] }
      const searchData: EsearchResponse = await searchRes.json()
      const ids = searchData.esearchresult?.idlist ?? []
      if (!ids.length) { cacheSet(cacheKey, [], CACHE_TTL_MS); return [] }

      const summaryUrl = `${EUTILS}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json&tool=${NCBI_TOOL}`
      const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(10_000) })
      if (!summaryRes.ok) { cacheSet(cacheKey, [], CACHE_TTL_MS); return [] }
      const summaryData: EsummaryResponse = await summaryRes.json()

      const items: NewsItem[] = ids
        .map((pmid, i): NewsItem | null => {
          const entry = summaryData.result?.[pmid]
          if (!entry || Array.isArray(entry) || !entry.title) return null
          const date = parsePubmedDate(entry.sortpubdate)
          if (!date) return null
          return {
            id:         `pubmed-${i}`,
            headline:   entry.title.replace(/\.$/, ''),
            date,
            source:     entry.source ?? 'PubMed',
            url:        `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
            category:   'Scientific Study',
            confidence: 0.9,   // PubMed is authoritative + exact title/abstract phrase match
            provider:   'pubmed',
          }
        })
        .filter((x): x is NewsItem => x !== null)

      cacheSet(cacheKey, items, CACHE_TTL_MS)
      return items
    } catch (e: unknown) {
      console.warn('[PubMed] fetch failed', { phrase, error: e instanceof Error ? e.message : e })
      return []
    }
  }
}
