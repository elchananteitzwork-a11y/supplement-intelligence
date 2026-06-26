import { newsEngine } from './registry'
import { explainNewsIntelligence, ITEMS_EXIST_NO_SUMMARY } from './explain'
import type { NewsIntelligence, NewsSummary } from './types'

// ── Top-level orchestration ──────────────────────────────────────────────
// Single entry point app/api/generate/route.ts calls: fetch real items from
// all providers, then (only if items exist) run the explain pass, merge the
// result, and return a complete NewsIntelligence object with the literal
// "No significant recent developments found." fallback already applied
// server-side — callers never need their own empty-state handling.

export const NEWS_WINDOW_DAYS = 60

const NO_NEWS_SUMMARY: NewsSummary = {
  what_changed:      'No significant recent developments found.',
  trajectory:        'Unknown',
  new_risks:         [],
  new_opportunities: [],
  key_events:        [],
}

export async function buildNewsIntelligence(
  query:        string,
  categoryId:   string,
  categoryName: string,
  fetchTimeoutMs = 15_000,
): Promise<NewsIntelligence> {
  const { items, providersUsed } = await newsEngine
    .fetch({ query, categoryId, windowDays: NEWS_WINDOW_DAYS }, fetchTimeoutMs)
    .catch((e: unknown) => {
      console.error('[NewsIntelligence] fetch failed', { error: e instanceof Error ? e.message : e })
      return { items: [], providersUsed: [] }
    })

  if (!items.length) {
    return {
      items: [], providersUsed, fetchedAt: new Date().toISOString(),
      windowDays: NEWS_WINDOW_DAYS, summary: NO_NEWS_SUMMARY, hasRecentNews: false,
    }
  }

  const explained = await explainNewsIntelligence(items, query, categoryName).catch((e: unknown) => {
    console.error('[NewsIntelligence] explain failed', { error: e instanceof Error ? e.message : e })
    return null
  })

  const finalItems = explained
    ? items.map(it => ({ ...it, why_it_matters: explained.whyItMatters.get(it.id) }))
    : items

  return {
    items:         finalItems,
    providersUsed,
    fetchedAt:     new Date().toISOString(),
    windowDays:    NEWS_WINDOW_DAYS,
    summary:       explained?.summary ?? ITEMS_EXIST_NO_SUMMARY,
    hasRecentNews: true,
  }
}
