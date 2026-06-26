// True stopwords — never useful for any search, no disambiguating value.
const STOPWORDS = ['for', 'with', 'and', 'the', 'a', 'an', 'of', 'to']

// Audience/age qualifiers — confirmed live (2026-06-26) that "senior" in
// "joint supplement for senior cats" matches PubMed's academic-paper
// boilerplate ("senior author") rather than anything about aging pets.
// These describe WHO the product is for, never WHAT it is — filtered
// everywhere, same as stopwords.
const AUDIENCE_WORDS = ['senior', 'seniors', 'adult', 'adults', 'kids', 'kid', 'children', 'child', 'baby', 'babies']

// Product-FORM words (capsule, powder, serum...) — generic for openFDA's
// single-keyword search (stripping them gets to the actual ingredient), but
// load-bearing for PubMed's 2-word phrase search: confirmed live (2026-06-26)
// that stripping "powder" from "electrolyte powder" leaves the single word
// "electrolyte," which in current literature is dominated by lithium-battery
// research, not hydration — the form word is exactly what disambiguates.
const PRODUCT_FORM_WORDS = [
  'supplement', 'supplements', 'capsules', 'capsule', 'gummies', 'gummy',
  'powder', 'tablets', 'tablet', 'serum', 'cream', 'lotion', 'oil',
]

const ALWAYS_EXCLUDE  = new Set([...STOPWORDS, ...AUDIENCE_WORDS])
const STRIP_FOR_SINGLE = new Set([...STOPWORDS, ...AUDIENCE_WORDS, ...PRODUCT_FORM_WORDS])

function words(query: string, exclude: Set<string>): string[] {
  const w = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(x => !exclude.has(x))
  return w.length ? w : query.toLowerCase().split(/\s+/).filter(Boolean)
}

// Used by GDELT — a free-text relevance search engine, not a strict AND/
// phrase matcher, so unlike the two functions below it should keep product-
// form words rather than strip them. Confirmed live (2026-06-26): stripping
// "supplement" from "joint supplement for senior cats" left the bare query
// "joint cats," too generic to anchor GDELT's ranking to the pet-health
// domain — real but irrelevant results came back (a Broadway "Cats"
// lighting designer, an unrelated company literally named "CATS Global
// Group"). Keeping "supplement" gives GDELT the context word it needs.
export function toSearchKeyword(query: string): string {
  return words(query, ALWAYS_EXCLUDE).slice(0, 4).join(' ').trim()
}

// Used by openFDA (quoted-phrase exact match against product_description) —
// a 3-4 word phrase essentially never appears verbatim in a recall record,
// so this is just the single core ingredient/product term. Confirmed live:
// "niacinamide oily skin" (3 words) finds 0 openFDA results; "niacinamide"
// alone finds matches. The openfda.ts provider adds its own substring
// relevance check on top of this (catches openFDA's hyphen-tokenization
// false positives, e.g. "pre-workout" partially matching "pre-packaged").
export function toPrimaryKeyword(query: string): string {
  return words(query, STRIP_FOR_SINGLE)[0] ?? ''
}

// Used by PubMed, as an exact [tiab] (title/abstract) phrase search — NOT
// the single bare word above, and NOT stripped of product-form words the
// way toPrimaryKeyword is. Confirmed live (2026-06-26): a single generic
// word, even restricted to [tiab], is dominated by an unrelated dominant
// sense in current literature — "electrolyte[tiab]" returns lithium-battery
// papers almost exclusively, not hydration research; "vitamin[tiab]" can't
// distinguish vitamin C from vitamin D. A 2-word exact phrase fixes this
// ("electrolyte powder"[tiab] → real hydration-supplement results) — but
// only if "powder" survives extraction, which is why this keeps product-
// form words instead of stripping them like the other two functions do.
// If the phrase finds nothing, the caller should accept zero results rather
// than falling back to the ambiguous single word.
export function toPubMedPhrase(query: string): string {
  return words(query, ALWAYS_EXCLUDE).slice(0, 2).join(' ').trim()
}
