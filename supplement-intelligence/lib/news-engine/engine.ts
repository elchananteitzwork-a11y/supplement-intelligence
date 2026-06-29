import type { NewsProvider, NewsContext, NewsItem } from './types'

// ── News Engine ───────────────────────────────────────────────────────────
// Unlike signal-engine (providers contribute to the SAME scored dimension,
// merged by weighted average) or keyword-engine (providers are alternatives,
// first success wins), news providers contribute DIFFERENT, complementary
// items to one shared list — so this just runs all of them in parallel and
// concatenates. One provider failing/timing out never blocks the others
// (Promise.allSettled, not Promise.all) — graceful degradation by construction.

export interface NewsFetchResult {
  items:          NewsItem[]
  providersUsed:  string[]
  // Real, deterministic: a provider that threw or hit this engine's own
  // race timeout, distinct from a provider that ran and legitimately found
  // zero items — both look the same in `items`/`providersUsed` alone, but a
  // safety-relevant consumer (the Safety Gate in lib/scoring.ts) needs to
  // tell "checked, clean" apart from "didn't run." Generic at this layer —
  // any provider failing is recorded, not just openFDA — so this stays
  // useful if a second safety-relevant provider is ever added.
  failedProviders: string[]
}

const MAX_ITEMS = 15

export class NewsEngine {
  constructor(private providers: NewsProvider[]) {}

  async fetch(ctx: NewsContext, timeoutMs = 15_000): Promise<NewsFetchResult> {
    const enabled = this.providers.filter(p => p.enabled)
    if (!enabled.length) return { items: [], providersUsed: [], failedProviders: [] }

    const TIMED_OUT = Symbol('timed-out')
    const withTimeout = (p: NewsProvider): Promise<NewsItem[] | typeof TIMED_OUT> =>
      Promise.race([
        p.fetch(ctx),
        new Promise<typeof TIMED_OUT>(resolve => setTimeout(() => resolve(TIMED_OUT), timeoutMs)),
      ]).catch((e: unknown) => {
        console.warn(`[NewsEngine] provider "${p.name}" threw`, { error: e instanceof Error ? e.message : e })
        return TIMED_OUT
      })

    const settled = await Promise.all(enabled.map(p => withTimeout(p)))

    const seenUrls = new Set<string>()
    const providersUsed: string[] = []
    const failedProviders: string[] = []
    const merged: NewsItem[] = []

    settled.forEach((result, i) => {
      if (result === TIMED_OUT) {
        failedProviders.push(enabled[i].name)
        return
      }
      if (result.length) providersUsed.push(enabled[i].name)
      for (const item of result) {
        if (seenUrls.has(item.url)) continue
        seenUrls.add(item.url)
        merged.push(item)
      }
    })

    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return { items: merged.slice(0, MAX_ITEMS), providersUsed, failedProviders }
  }
}
