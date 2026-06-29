import type { AggregatedSignals } from '@/lib/signal-engine/types'
import type { ConsumerIntelligenceReport } from '@/lib/consumer-intelligence'

// ── CategoryModule ─────────────────────────────────────────────────────────
//
// The universal contract every category must implement. Adding a new category
// means creating one file that satisfies this interface and registering it.
// Routes and UI are category-agnostic — they only ever talk to this interface.

export interface CategoryModule {
  readonly id:          string   // 'supplements', 'beauty', 'pets', …
  readonly name:        string   // 'Supplements'
  readonly slug:        string   // URL-safe, e.g. 'supplements'
  readonly tagline:     string   // one-line value prop shown in UI
  readonly description: string   // slightly longer description
  readonly icon:        string   // emoji or symbol for UI chips

  // ── Discovery pipeline ──────────────────────────────────────────────────
  // Base system prompt for the discovery (opportunity-listing) LLM call.
  readonly discoverySystemPrompt: string

  // Returns a weekly-refresh variant of the discovery prompt.
  // 2026-06-26: keyed on the AI's own qualitative promise tier, not a
  // fabricated score — see types/index.ts PromiseTier.
  buildRefreshPrompt(
    previous: Array<{ name: string; promise: string }>,
  ): string

  // Optionally injects real-market signal data into any base prompt.
  // Returns the base prompt unchanged when signals are absent or low-confidence.
  // consumerIntelligence (added 2026-06-25): real review-derived themes, when
  // available — injected so market_gaps/customer_language/biggest_competitor.gap
  // can cite real customer feedback instead of inventing it from nothing.
  buildSignalAugmentedPrompt(
    basePrompt:          string,
    query:               string,
    signals:             AggregatedSignals | null,
    consumerIntelligence?: ConsumerIntelligenceReport | null,
  ): string

  // ── Analysis pipeline ───────────────────────────────────────────────────
  // System prompt for the full-memo LLM call.
  readonly analysisSystemPrompt: string

  // Gate that decides whether an input string is relevant to this category.
  // Used by the generate route to reject off-category queries. Async: the
  // fast vocabulary check runs first and resolves synchronously in the
  // common case, but falls through to an LLM confirmation (see
  // lib/categories/relevance-matching.ts confirmRelevanceWithLLM) when it
  // finds no match, rather than rejecting on a closed-vocabulary miss.
  isRelevantQuery(input: string): Promise<boolean>

  // ── Client-safe helpers ─────────────────────────────────────────────────
  // These contain no server-only imports and can be used in client components.

  // True when the input is broad enough to warrant discovery mode.
  isBroadQuery(input: string): boolean

  readonly examples: {
    broad:    string[]   // broad categories → discovery mode
    specific: string[]   // specific ideas  → direct full analysis
  }
}
