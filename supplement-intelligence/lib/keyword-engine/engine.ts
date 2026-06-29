import type { KeywordProvider, KeywordIntelligence } from './types'

// Single-provider today (DataForSEO), but kept as a thin engine wrapper —
// same shape as lib/signal-engine/engine.ts — so a second keyword data
// source (Ahrefs, SEMrush, etc.) can be added later without touching callers.
export class KeywordEngine {
  private providers: KeywordProvider[]

  constructor(providers: KeywordProvider[]) {
    this.providers = providers
  }

  // PR review finding (2026-06-28): this used to be a bare `Promise.race`
  // against a timer. When the timer won, this function returned `null` to
  // its caller, but the provider's own promise was never cancelled — it
  // kept running (more billed API calls, more candidate attempts) with
  // nothing left to read the result. Passing a real AbortSignal lets a
  // well-behaved provider (see KeywordProvider.fetch's contract) actually
  // stop that work instead of abandoning it. 25s default (was an unused
  // 12s — every real call site already overrides this, and 12s is barely
  // enough for ONE of DataForSEO's own 12s-bounded attempts, defeating the
  // multi-candidate broadening retry this engine exists to support).
  async fetch(seedKeyword: string, timeoutMs = 25_000): Promise<KeywordIntelligence | null> {
    const enabled = this.providers.filter(p => p.enabled)
    if (!enabled.length) return null

    for (const provider of enabled) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const result = await provider.fetch(seedKeyword, controller.signal)
        if (result) return result
      } catch {
        // Providers are expected to catch their own errors and resolve
        // null (see DataForSeoKeywordProvider) — this is a defensive
        // backstop for a future provider that doesn't.
      } finally {
        clearTimeout(timer)
      }
    }
    return null
  }
}
