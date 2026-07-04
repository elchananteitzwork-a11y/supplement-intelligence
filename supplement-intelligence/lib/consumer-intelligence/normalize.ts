// ── Semantic normalization of phrase clusters ─────────────────────────────────
//
// Step 2 of the Customer Pain improvement plan (2026-07-03).
//
// Problem: n-gram phrase clustering (cluster.ts) produces raw verbatim labels
// that suffer from three failure modes:
//
//   1. Synonyms — "see difference" and "notice difference" are one complaint,
//      but surface as two independent themes. Cross-competitor correlation
//      (Step 3) would miss the connection between them.
//
//   2. Sentiment-ambiguous phrases — a phrase like "easy swallow" can appear
//      in a critical (1-3★) review in a positive context: "it's easy to swallow
//      but didn't help me sleep." The n-gram extractor captures the phrase
//      without the sentiment context; this theme inflates the pain signal.
//
//   3. Noise — "item bought", "like product" pass the frequency threshold but
//      convey no actionable pain point.
//
// Solution: after clustering, call claude-haiku-4-5 to:
//   (a) assign a canonical 2-4 word semantic label to each cluster
//   (b) classify the phrase's actual sentiment in context
//   (c) flag noise
//   Then merge clusters sharing the same canonical label and filter out
//   positive-sentiment and noise clusters.
//
// Cost:  ~$0.003 / analysis (Haiku @ $0.80/M input, $4/M output; ~10 themes)
// Latency: ~1-2 s (Haiku) — within the existing 90s TOTAL_TIMEOUT_MS
//
// Graceful fallback: if ANTHROPIC_API_KEY is absent or the call fails for
// any reason, the original clusters are returned unchanged — identical to
// pre-Step-2 behavior.

import Anthropic from '@anthropic-ai/sdk'
import type { PhraseCluster } from './cluster'

// ── Internal Haiku response shape ──────────────────────────────────────────────

interface HaikuResult {
  index:          number
  canonicalLabel: string
  sentiment:      'negative' | 'positive' | 'mixed'
  isNoise:        boolean
}

// ── Haiku classification call ─────────────────────────────────────────────────

async function classifyWithHaiku(
  clusters: PhraseCluster[],
  context: { category: string; corpusType: 'negative' | 'positive' | 'all' },
): Promise<HaikuResult[] | null> {
  const phrases = clusters.map((c, i) => ({
    index: i,
    label: c.label,
    quote: c.exampleQuote.slice(0, 250),
  }))

  const corpusDesc =
    context.corpusType === 'negative' ? '1-3 star critical reviews' :
    context.corpusType === 'positive' ? '4-5 star positive reviews' :
    'all-star reviews'

  const systemPrompt =
    'You are a product review analyst. Classify complaint phrases extracted from Amazon reviews. ' +
    'Respond with valid JSON only — no markdown fences, no preamble, no explanation.'

  const userPrompt =
    `Category: ${context.category}\n` +
    `Corpus: ${corpusDesc}\n\n` +
    `For each phrase below, return a JSON array where each element has:\n` +
    `  - index: same integer as the input object\n` +
    `  - canonicalLabel: 2-4 word plain-English label for the underlying complaint ` +
    `(e.g. "no visible results", "poor adhesion", "capsule too large"). ` +
    `If multiple phrases describe the same complaint, give them IDENTICAL canonicalLabel values.\n` +
    `  - sentiment: "negative" if this phrase is a genuine complaint or pain point; ` +
    `"positive" if the phrase is actually praise even though it appears in a critical review ` +
    `(e.g. example quote says the thing is GOOD); "mixed" if genuinely ambiguous\n` +
    `  - isNoise: true ONLY if the phrase is so generic it conveys no specific product problem ` +
    `(e.g. "really like", "great product", "item bought"). False for anything describing a ` +
    `real customer experience, even if minor.\n\n` +
    `Input:\n${JSON.stringify(phrases, null, 2)}`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create(
      {
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 800,
        temperature: 0,
        system:  systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      { signal: AbortSignal.timeout(10_000) },
    )

    const raw = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    const parsed = JSON.parse(raw) as HaikuResult[]
    if (!Array.isArray(parsed) || parsed.length !== clusters.length) return null

    return parsed
  } catch {
    return null
  }
}

// ── Merge synonymous clusters ─────────────────────────────────────────────────
//
// Clusters sharing the same canonicalLabel are merged:
//   - reviewIds are deduplicated (union)
//   - reviewCount = deduplicated union size (accurate, avoids double-counting)
//   - label = canonicalLabel (semantic label replaces raw phrase)
//   - exampleQuote = taken from the raw cluster with the most reviews
//
// Clusters where sentiment = 'positive' or isNoise = true are dropped.

function mergeByCanonical(
  clusters:  PhraseCluster[],
  haiku:     HaikuResult[],
): PhraseCluster[] {
  // Group clusters by canonical label, skipping positive/noise entries.
  const groups = new Map<string, { canonical: string; members: PhraseCluster[] }>()

  for (let i = 0; i < clusters.length; i++) {
    const h = haiku[i]
    if (!h) continue
    if (h.sentiment === 'positive' || h.isNoise) continue

    const key = h.canonicalLabel.toLowerCase().trim()
    if (!groups.has(key)) {
      groups.set(key, { canonical: h.canonicalLabel, members: [] })
    }
    groups.get(key)!.members.push(clusters[i])
  }

  // For each group: deduplicate review IDs, pick best quote.
  const merged: PhraseCluster[] = Array.from(groups.values()).map(({ canonical, members }) => {
    const sortedByCount = members.slice().sort((a, b) => b.reviewCount - a.reviewCount)
    const allIds = Array.from(new Set(members.flatMap(m => m.reviewIds)))

    return {
      label:        canonical,
      reviewCount:  allIds.length,
      reviewIds:    allIds,
      exampleQuote: sortedByCount[0].exampleQuote,
    }
  })

  return merged.sort((a, b) => b.reviewCount - a.reviewCount)
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface NormalizationDetail {
  rawLabel:       string
  canonicalLabel: string
  sentiment:      'negative' | 'positive' | 'mixed'
  isNoise:        boolean
  action:         'kept' | 'merged' | 'filtered'
}

export interface NormalizeResult {
  clusters:  PhraseCluster[]          // filtered + merged output, drop-in for clusterPhrases()
  details:   NormalizationDetail[]    // per-raw-cluster audit trail
  used_haiku: boolean                 // false = fallback path (original clusters returned)
  tokens?:   { input: number; output: number }
}

/**
 * Normalize and merge raw phrase clusters using Haiku semantic classification.
 *
 * Returns a NormalizeResult whose `clusters` field is a drop-in replacement
 * for the raw clusterPhrases() output — same PhraseCluster[] interface, so
 * the rest of the pipeline (toThemes, analyze.ts return statement) needs no
 * changes.
 *
 * If ANTHROPIC_API_KEY is absent or the API call fails for any reason,
 * `clusters` equals the original input and `used_haiku` is false.
 */
export async function normalizeAndMerge(
  clusters: PhraseCluster[],
  context: {
    category:    string
    corpusType:  'negative' | 'positive' | 'all'
  },
): Promise<NormalizeResult> {
  if (!clusters.length) {
    return { clusters, details: [], used_haiku: false }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { clusters, details: [], used_haiku: false }
  }

  // Run Haiku classification
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const phrases = clusters.map((c, i) => ({
    index: i,
    label: c.label,
    quote: c.exampleQuote.slice(0, 250),
  }))

  const corpusDesc =
    context.corpusType === 'negative' ? '1-3 star critical reviews' :
    context.corpusType === 'positive' ? '4-5 star positive reviews' :
    'all-star reviews'

  let haiku: HaikuResult[] | null = null
  let tokens: { input: number; output: number } | undefined

  try {
    const msg = await client.messages.create(
      {
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 800,
        temperature: 0,
        system:
          'You are a product review analyst. Classify complaint phrases extracted from Amazon reviews. ' +
          'Respond with valid JSON only — no markdown fences, no preamble, no explanation.',
        messages: [{
          role: 'user',
          content:
            `Category: ${context.category}\n` +
            `Corpus: ${corpusDesc}\n\n` +
            `For each phrase below, return a JSON array where each element has:\n` +
            `  - index: same integer as the input object\n` +
            `  - canonicalLabel: 2-4 word plain-English label for the underlying complaint ` +
            `(e.g. "no visible results", "poor adhesion", "capsule too large"). ` +
            `If multiple phrases describe the same complaint, give them IDENTICAL canonicalLabel values.\n` +
            `  - sentiment: "negative" if this phrase is a genuine complaint or pain point; ` +
            `"positive" if the phrase is actually praise even though it appears in a critical review ` +
            `(example quote says the thing is GOOD); "mixed" if genuinely ambiguous\n` +
            `  - isNoise: true ONLY if the phrase is so generic it conveys no specific product problem ` +
            `(e.g. "really like", "great product", "item bought"). False for real customer experiences.\n\n` +
            `Input:\n${JSON.stringify(phrases, null, 2)}`,
        }],
      },
      { signal: AbortSignal.timeout(10_000) },
    )

    tokens = { input: msg.usage.input_tokens, output: msg.usage.output_tokens }

    const raw = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
      // Strip markdown code fences: Haiku wraps JSON in ```json ... ``` despite instructions
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim()

    const parsed = JSON.parse(raw) as HaikuResult[]
    if (Array.isArray(parsed) && parsed.length === clusters.length) {
      // Normalize canonical labels: replace underscores with spaces so
      // labels are human-readable and string comparison for Step 3 works
      // regardless of whether Haiku uses snake_case or space-separated.
      haiku = parsed.map(h => ({
        ...h,
        canonicalLabel: h.canonicalLabel.replace(/_/g, ' ').toLowerCase().trim(),
      }))
    }
  } catch {
    // Graceful fallback — API unavailable or JSON parse error
  }

  if (!haiku) {
    return { clusters, details: [], used_haiku: false }
  }

  // Build audit trail
  const details: NormalizationDetail[] = clusters.map((c, i) => {
    const h = haiku![i]
    const filtered = h.sentiment === 'positive' || h.isNoise
    return {
      rawLabel:       c.label,
      canonicalLabel: h.canonicalLabel,
      sentiment:      h.sentiment,
      isNoise:        h.isNoise,
      action:         filtered ? 'filtered' : 'kept',  // 'merged' set below
    }
  })

  // Mark merged entries: any canonical label that appears more than once
  const canonicalCounts = new Map<string, number>()
  for (const h of haiku) {
    if (h.sentiment !== 'positive' && !h.isNoise) {
      const key = h.canonicalLabel.toLowerCase().trim()
      canonicalCounts.set(key, (canonicalCounts.get(key) ?? 0) + 1)
    }
  }
  for (let i = 0; i < details.length; i++) {
    const h = haiku[i]
    if (details[i].action === 'kept') {
      const key = h.canonicalLabel.toLowerCase().trim()
      if ((canonicalCounts.get(key) ?? 0) > 1) details[i].action = 'merged'
    }
  }

  const merged = mergeByCanonical(clusters, haiku)
  return { clusters: merged, details, used_haiku: true, tokens }
}
