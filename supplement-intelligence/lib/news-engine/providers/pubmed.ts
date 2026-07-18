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
interface EsummaryItem { title?: string; sortpubdate?: string; pubdate?: string; source?: string; pubtype?: string[] }
interface EsummaryResponse { result?: Record<string, EsummaryItem | string[]> }

function parsePubmedDate(sortpubdate: string | undefined): string | null {
  if (!sortpubdate) return null
  // Format: "2026/06/23 00:00"
  const d = new Date(sortpubdate.replace(' ', 'T').replace(/\//g, '-') + 'Z')
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// CONFIRMED VIA LIVE CALL 2026-06-27: esummary's pubtype[] is a real NLM-
// assigned field, but typically contains a generic entry ("Journal Article")
// alongside (or instead of) a methodologically specific one. Most-informative-
// first so "Meta-Analysis" wins over "Journal Article" when both are present;
// a study with only generic types gets no study_type rather than a label
// that doesn't actually say anything about methodology.
// Exported (Roadmap M2.16): lib/science-engine/pubmed.ts reuses this exact
// priority list/function to classify PubMed's real pubtype[] field for the
// Clinical Evidence Engine, rather than duplicating it — same real NLM
// vocabulary, same "most-informative-first" judgment call, one source of
// truth. Purely additive (export keyword only) — no behavior change here.
// LIVE-CONFIRMED (2026-07-17 audit, real PubMed esummary responses): pubtype[]
// often carries phase-specific clinical-trial labels ('Clinical Trial, Phase
// I' .. 'Phase IV') instead of, or in addition to, the bare 'Clinical Trial'
// entry. These are real NLM-assigned pubtypes, not a guess — added at the
// same evidence tier as bare 'Clinical Trial' (immediately after it) so a
// phase-labeled trial with no other, more specific tag (RCT, Meta-Analysis,
// etc.) present is still recognized as clinical-trial-grade evidence instead
// of silently resolving to `undefined`.
export const STUDY_TYPE_PRIORITY = [
  'Meta-Analysis',
  'Systematic Review',
  'Randomized Controlled Trial',
  'Controlled Clinical Trial',
  'Clinical Trial',
  'Clinical Trial, Phase I',
  'Clinical Trial, Phase II',
  'Clinical Trial, Phase III',
  'Clinical Trial, Phase IV',
  'Multicenter Study',
  'Comparative Study',
  'Observational Study',
  'Review',
  'Case Reports',
]

export function pickStudyType(pubtype: string[] | undefined): string | undefined {
  if (!pubtype?.length) return undefined
  return STUDY_TYPE_PRIORITY.find(t => pubtype.includes(t))
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
      // HARDENING FIX (2026-06-28): unlike openFDA, PubMed's E-utilities
      // never use a non-200 status to mean "zero results" — a genuinely
      // empty search comes back as HTTP 200 with an empty idlist (handled
      // below). So every `!res.ok` here is a real failure, not a "checked,
      // clean" result — must not be cached as if it were (was previously
      // caching `[]` for 6h on any HTTP error, the exact "checked vs.
      // didn't check" honesty gap already fixed for openFDA). Re-thrown so
      // NewsEngine records pubmed as a failed provider rather than "ran,
      // found nothing" — harmless today (nothing currently keys off a
      // pubmed-specific failedProviders entry the way the Safety Gate keys
      // off openfda), but accurate bookkeeping, not a guess.
      const searchUrl = `${EUTILS}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=5&retmode=json&datetype=pdat&reldate=${ctx.windowDays}&tool=${NCBI_TOOL}`
      const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10_000) })
      if (!searchRes.ok) throw new Error(`PubMed esearch HTTP ${searchRes.status}`)
      const searchData: EsearchResponse = await searchRes.json()
      const ids = searchData.esearchresult?.idlist ?? []
      if (!ids.length) { cacheSet(cacheKey, [], CACHE_TTL_MS); return [] }

      const summaryUrl = `${EUTILS}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json&tool=${NCBI_TOOL}`
      const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(10_000) })
      if (!summaryRes.ok) throw new Error(`PubMed esummary HTTP ${summaryRes.status}`)
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
            study_type: pickStudyType(entry.pubtype),
          }
        })
        .filter((x): x is NewsItem => x !== null)

      cacheSet(cacheKey, items, CACHE_TTL_MS)
      return items
    } catch (e: unknown) {
      // Never cached, re-thrown — see the HTTP-error checks above.
      console.warn('[PubMed] fetch failed', { phrase, error: e instanceof Error ? e.message : e })
      throw e
    }
  }
}
