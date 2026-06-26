import type { NewsProvider, NewsContext, NewsItem } from './types'

// ── News Engine ───────────────────────────────────────────────────────────
// Unlike signal-engine (providers contribute to the SAME scored dimension,
// merged by weighted average) or keyword-engine (providers are alternatives,
// first success wins), news providers contribute DIFFERENT, complementary
// items to one shared list — so this just runs all of them in parallel and
// concatenates. One provider failing/timing out never blocks the others
// (Promise.allSettled, not Promise.all) — graceful degradation by construction.

export interface NewsFetchResult {
  items:         NewsItem[]
  providersUsed: string[]
}

const MAX_ITEMS = 15

export class NewsEngine {
  constructor(private providers: NewsProvider[]) {}

  async fetch(ctx: NewsContext, timeoutMs = 15_000): Promise<NewsFetchResult> {
    const enabled = this.providers.filter(p => p.enabled)
    if (!enabled.length) return { items: [], providersUsed: [] }

    const withTimeout = (p: NewsProvider): Promise<NewsItem[]> =>
      Promise.race([
        p.fetch(ctx),
        new Promise<NewsItem[]>(resolve => setTimeout(() => resolve([]), timeoutMs)),
      ]).catch((e: unknown) => {
        console.warn(`[NewsEngine] provider "${p.name}" threw`, { error: e instanceof Error ? e.message : e })
        return []
      })

    const settled = await Promise.all(enabled.map(p => withTimeout(p)))

    const seenUrls = new Set<string>()
    const providersUsed: string[] = []
    const merged: NewsItem[] = []

    settled.forEach((items, i) => {
      if (items.length) providersUsed.push(enabled[i].name)
      for (const item of items) {
        if (seenUrls.has(item.url)) continue
        seenUrls.add(item.url)
        merged.push(item)
      }
    })

    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return { items: merged.slice(0, MAX_ITEMS), providersUsed }
  }
}
