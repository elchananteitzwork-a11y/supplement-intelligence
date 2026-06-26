// Strips generic category words so "Ashwagandha Capsules For Stress" →
// "ashwagandha" — the specific, searchable ingredient/product term. Same
// stripping intent as lib/signal-engine/providers/google-trends.ts's
// toSearchKeyword, generalized across all 5 categories instead of just
// "supplement(s)".
const GENERIC_WORDS = new Set([
  'supplement', 'supplements', 'capsules', 'capsule', 'gummies', 'gummy',
  'powder', 'tablets', 'tablet', 'serum', 'cream', 'lotion', 'oil',
  'for', 'with', 'and', 'the', 'a', 'an', 'of', 'to',
])

function significantWords(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !GENERIC_WORDS.has(w))
  return words.length ? words : query.toLowerCase().split(/\s+/).filter(Boolean)
}

// Used by GDELT — a free-text relevance search engine, fine with a multi-
// word phrase (it ranks by relevance, doesn't require every word to match).
export function toSearchKeyword(query: string): string {
  return significantWords(query).slice(0, 4).join(' ').trim()
}

// Used by PubMed (esearch ANDs every space-separated term) and openFDA
// (quoted-phrase exact match) — both are precision search APIs where adding
// a second or third word (e.g. "niacinamide oily skin") doesn't narrow the
// result to "more specific," it narrows it to "almost certainly zero,"
// since a real recall/study's text essentially never contains a broad
// descriptive phrase verbatim. Confirmed live: "niacinamide oily skin" finds
// 0 PubMed results in a 60-day window; "niacinamide" alone finds 118. Just
// the single core ingredient/product term, not the full extracted phrase.
export function toPrimaryKeyword(query: string): string {
  return significantWords(query)[0] ?? query.toLowerCase().split(/\s+/)[0] ?? ''
}
