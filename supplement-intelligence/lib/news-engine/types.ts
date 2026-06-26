// ── Real-Time News Intelligence — public types ─────────────────────────────
//
// Every NewsItem's headline/date/source/url/category/confidence comes
// directly from a real provider (openFDA, PubMed, GDELT) — never from the
// LLM. The LLM's only role (lib/news-engine/explain.ts) is to write a short
// "why it matters" caption per item and an overall summary, both grounded
// strictly in the real items already fetched — it never invents, modifies,
// or adds an item. See app/api/generate/route.ts for how this stays off the
// main memo-generation prompt entirely (a separate, parallel Haiku call).

export type NewsCategory =
  | 'Product Launch'
  | 'FDA Recall'
  | 'Regulatory Change'
  | 'Acquisition'
  | 'Funding Round'
  | 'Competitor Announcement'
  | 'Industry News'
  | 'Scientific Study'

export interface NewsItem {
  id:         string          // stable per-fetch id (provider:index) — used only to merge why_it_matters back from the explain() call, never shown
  headline:   string          // verbatim (FDA/PubMed) or as-published (GDELT) — never paraphrased by an LLM
  date:       string          // ISO 8601
  source:     string          // publisher/outlet, or "FDA" / "PubMed"
  url:        string          // real, direct link — verified to resolve (see providers)
  category:   NewsCategory
  confidence: number          // 0–1 — deterministic RELEVANCE-match confidence (keyword/category overlap), not "is this real" (it always is)
  provider:   string          // 'openfda' | 'pubmed' | 'gdelt'
  why_it_matters?: string     // added by explain.ts — AI Interpretation tier, grounded only in the fields above
}

export interface NewsSummary {
  what_changed:      string    // server-set literal fallback when no items exist or AI summary unavailable — never invented
  trajectory:        'Accelerating' | 'Stable' | 'Slowing' | 'Unknown'
  new_risks:         string[]
  new_opportunities: string[]
  key_events:        string[]
}

export interface NewsIntelligence {
  items:         NewsItem[]
  providersUsed: string[]
  fetchedAt:     string
  windowDays:    number
  summary:       NewsSummary
  hasRecentNews: boolean
}

export interface NewsContext {
  query:       string
  categoryId?: string    // resolved category module id — lets a provider skip categories it doesn't apply to (e.g. openFDA skips 'home')
  windowDays:  number    // 30–90
}

export interface NewsProvider {
  readonly name:    string
  readonly enabled: boolean
  // Never throws — returns [] on any failure (no key, rate-limited, network
  // error, category not applicable) so one provider's outage never fails
  // the whole report. Errors are logged inside fetch(), not surfaced here.
  fetch(ctx: NewsContext): Promise<NewsItem[]>
}
