import type { NewsCategory } from './types'

// ── Deterministic categorization + relevance confidence ─────────────────────
//
// Keyword classification, not an LLM judgment call — same reasoning as the
// rest of this engagement's evidence-first work: a factual classification
// should be reproducible and auditable, not a model guess. Only used for
// GDELT items; openFDA and PubMed items get a fixed category directly from
// which provider/endpoint found them (already deterministic by construction).

const PATTERNS: { category: NewsCategory; re: RegExp }[] = [
  { category: 'FDA Recall',               re: /\b(recalls?|recalled|fda warning|safety alert)\b/i },
  { category: 'Funding Round',            re: /\b(raises?|funding round|series [a-e]\b|venture capital|seed round|investors?)\b/i },
  { category: 'Acquisition',              re: /\b(acquir(e|es|ed|ing|ition)|merger|buyout|to be bought|takeover)\b/i },
  { category: 'Product Launch',           re: /\b(launch(es|ed|ing)?|unveils?|debuts?|introduces?|now available|hits shelves)\b/i },
  { category: 'Scientific Study',         re: /\b(study|clinical trial|researchers?|published in|peer.review|journal of)\b/i },
  { category: 'Regulatory Change',        re: /\b(regulat(ion|ory|es|ed)|ban(s|ned)?|legislation|compliance|fssai|ftc|fda (?:proposes|finalizes|issues))\b/i },
]

// Word-overlap between the query/category and the article title — a crude
// but auditable relevance signal. Higher overlap = more likely this article
// is actually about the product/category being analyzed, not a same-keyword
// false positive from an unrelated context.
function wordOverlap(query: string, title: string): number {
  const qWords = Array.from(new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2)))
  const tWords = new Set(title.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2))
  if (qWords.length === 0) return 0.5
  const hits = qWords.filter(w => tWords.has(w)).length
  return hits / qWords.length
}

export function categorizeHeadline(title: string): NewsCategory {
  for (const { category, re } of PATTERNS) {
    if (re.test(title)) return category
  }
  return 'Industry News'
}

// 0.45–0.9 range — GDELT already keyword-matched the query server-side, so
// even a weak title-overlap result is a real, query-matched article, not a
// random one. Overlap just separates "directly about this" from "mentions
// the category in passing."
export function newsRelevanceConfidence(query: string, title: string): number {
  const overlap = wordOverlap(query, title)
  return Math.round((0.45 + overlap * 0.45) * 100) / 100
}
