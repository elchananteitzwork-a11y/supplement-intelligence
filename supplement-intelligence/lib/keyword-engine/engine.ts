import type { KeywordProvider, KeywordIntelligence } from './types'

// Single-provider today (DataForSEO), but kept as a thin engine wrapper —
// same shape as lib/signal-engine/engine.ts — so a second keyword data
// source (Ahrefs, SEMrush, etc.) can be added later without touching callers.
export class KeywordEngine {
  private providers: KeywordProvider[]

  constructor(providers: KeywordProvider[]) {
    this.providers = providers
  }

  async fetch(seedKeyword: string, timeoutMs = 12_000): Promise<KeywordIntelligence | null> {
    const enabled = this.providers.filter(p => p.enabled)
    if (!enabled.length) return null

    for (const provider of enabled) {
      const result = await Promise.race([
        provider.fetch(seedKeyword),
        new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
      ]).catch(() => null)
      if (result) return result
    }
    return null
  }
}
