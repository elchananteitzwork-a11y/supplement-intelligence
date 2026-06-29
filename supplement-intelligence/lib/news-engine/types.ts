// ── Real-Time News Intelligence — public types ─────────────────────────────
//
// Every NewsItem's headline/date/source/url/category/confidence comes
// directly from a real provider (openFDA, PubMed, GDELT) — never from the
// LLM. The LLM's only role (lib/news-engine/explain.ts) is to write a short
// "why it matters" caption per item and an overall summary, both grounded
// strictly in the real items already fetched — it never invents, modifies,
// or adds an item. See app/api/generate/route.ts for how this stays off the
// main memo-generation prompt entirely (a separate, parallel Haiku call).

import type { GdeltSentiment } from './sentiment'

export type NewsCategory =
  | 'Product Launch'
  | 'FDA Recall'
  | 'Adverse Event Signal'
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

  // ── Additive (2026-06-26 data-coverage audit) — provider-specific real
  // fields, optional since only the originating provider populates them.

  // openFDA only — real FDA-assigned severity tier (CONFIRMED VIA LIVE CALL
  // 2026-06-26: real values seen include "Class I", "Class II", "Class III",
  // "Not Yet Classified" — not a fixed enum, openFDA's own field). Class I =
  // reasonable probability of serious health consequences or death.
  recall_classification?: string
  // openFDA only — real recall status (CONFIRMED VIA LIVE CALL 2026-06-26:
  // "Ongoing" seen live; openFDA also documents "Completed"/"Terminated").
  recall_status?: string

  // openFDA /food/event only — real CAERS adverse-event signal, distinct
  // from a recall (CONFIRMED VIA LIVE CALL 2026-06-27: real, queryable
  // dataset — 2,189 records for a common category). A consumer-reported
  // reaction, not a regulatory action — disclosed as such in the UI.
  adverse_event_reactions?: string[]

  // PubMed only — real NLM-assigned study-design type from esummary's
  // pubtype[] field (CONFIRMED VIA LIVE CALL 2026-06-27: real values seen
  // include "Journal Article", "Letter"; PubMed's own controlled vocabulary
  // also includes "Randomized Controlled Trial", "Meta-Analysis",
  // "Systematic Review", etc.). Picks the most methodologically informative
  // value present rather than a generic type — see STUDY_TYPE_PRIORITY in
  // providers/pubmed.ts. Replaces what used to be an AI-judged ★ evidence
  // tier for any study this provider actually surfaces with a real,
  // independently verifiable label.
  study_type?: string
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
  // Real, deterministic: providers that threw or hit this engine's own
  // timeout, distinct from providers that ran and legitimately found
  // nothing — see lib/news-engine/engine.ts NewsFetchResult.failedProviders.
  // Lets the Safety Gate (lib/scoring.ts) tell "openFDA checked, found no
  // recalls" apart from "openFDA's check never completed" instead of
  // treating both as equally clean.
  failedProviders: string[]
  fetchedAt:     string
  windowDays:    number
  summary:       NewsSummary
  hasRecentNews: boolean
  // Real GDELT sentiment (mode=tonechart) — a query-level aggregate over
  // real articles, not a per-item field (GDELT's per-article search response
  // has no tone field; see lib/news-engine/sentiment.ts). Best-effort: null
  // when GDELT's rate limit blocks this specific request, same as any other
  // "No data available" gap in this codebase — never backfilled with a guess.
  sentiment?: GdeltSentiment | null
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
