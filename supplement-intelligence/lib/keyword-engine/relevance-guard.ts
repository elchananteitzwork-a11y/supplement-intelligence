// ── Keyword Relevance Guard ──────────────────────────────────────────────
//
// ROOT CAUSE (found 2026-06-28 production audit): the broadening fallback
// in dataforseo.ts finds *some* real keyword data by progressively
// stripping words from the query, but nothing ever checked whether the
// resulting top-volume keyword was still about the same product. DataForSEO's
// related-keyword graph can surface a high-volume term from an adjacent
// market as the single highest-volume "related" item for a broadened seed —
// CONFIRMED VIA LIVE CALL: "Senior Dog Mobility Support" -> seed broadened
// to "Mobility Support" -> top related keyword "mobility scooter" (human
// mobility aids, 60,500/mo) credited as "Verified Data" demand for a PET
// product. Same pattern: "Probiotic for dogs" -> bare "probiotic" (human
// probiotics); "Scalp Microbiome Restoration" -> gut-health keywords.
//
// This module answers one narrow question: does a candidate keyword still
// describe the same product/market as the original query, well enough to
// be credited as verified evidence for it? It is deliberately conservative
// about REJECTING — a query with no recognized qualifier at all (e.g.
// "Cartilage Regeneration Collagen Peptides", which contains no word from
// any list below) always passes, exactly like the over-broad HOME_TOKENS/
// FITNESS_TOKENS exact-match vocabularies elsewhere in this codebase. The
// goal is to catch the specific drift pattern above, not to re-introduce
// another rigid keyword whitelist.

// Each category below is a "primary" qualifier: if the ORIGINAL query
// contains a word from this set, the candidate keyword must contain AT
// LEAST ONE of those SAME matched words (not just any word from the
// category) or the candidate is rejected as describing a different market.
// Plural/irregular forms are listed explicitly rather than derived, to
// avoid the exact-match singular/plural gap already found once this session
// (HOME_TOKENS had 'curtain' but not 'curtains').
//
// SPECIES vs HUMAN_DEMOGRAPHIC are deliberately two SEPARATE categories,
// not one shared "target user/species" pool, despite the spec listing them
// together. Found while validating this exact guard: with a single shared
// pool, "Senior Dog Mobility Support" -> "mobility aids for seniors near
// me" was wrongly ALLOWED — "senior" (human demographic) matched and was
// treated as preserving the category, even though "dog" (species) — the
// word that actually disambiguates pet from human — was dropped. A
// demographic word must never be allowed to "cover for" a missing species
// word; they answer different questions (who is the user vs what species).
const SPECIES_TOKENS = new Set(['dog', 'dogs', 'cat', 'cats'])

const HUMAN_DEMOGRAPHIC_TOKENS = new Set([
  'baby', 'babies', 'women', 'woman', 'men', 'man', 'senior', 'seniors', 'kid', 'kids', 'child', 'children',
])

const BODY_AREA_TOKENS = new Set([
  'scalp', 'hair', 'skin', 'gut', 'joint', 'joints', 'sleep', 'digestion', 'digestive',
])

const PRODUCT_TYPE_TOKENS = new Set([
  'supplement', 'supplements', 'cream', 'creams', 'chew', 'chews', 'serum', 'serums',
  'powder', 'powders', 'spray', 'sprays', 'diffuser', 'diffusers', 'collar', 'collars', 'litter',
])

// Use-case/problem qualifiers are tracked (per spec) but never block on
// their own — CONFIRMED by the required test matrix: "joint supplement for
// AGING dogs" -> "joint supplements for dogs" must be ALLOWED even though
// "aging" is dropped, as long as species + body area survive. Listed here
// for documentation/future use, not currently read by checkKeywordRelevance.
export const USE_CASE_TOKENS = new Set([
  'mobility', 'bloating', 'anxiety', 'pain', 'pains', 'aging', 'aged', 'recovery', 'odor', 'odors',
])

const PRIMARY_CATEGORIES: { name: string; vocab: Set<string> }[] = [
  { name: 'species', vocab: SPECIES_TOKENS },
  { name: 'target demographic', vocab: HUMAN_DEMOGRAPHIC_TOKENS },
  { name: 'body area', vocab: BODY_AREA_TOKENS },
  { name: 'product type', vocab: PRODUCT_TYPE_TOKENS },
]

// Bug found while testing this exact guard: "supplement" (original) vs
// "supplements" (candidate) both matched PRODUCT_TYPE_TOKENS individually,
// but as distinct literal strings they failed the preserved-word
// comparison below — the identical singular/plural exact-match gap already
// found once this session in HOME_TOKENS. Canonicalizing every match to a
// singular form before comparing closes it for this guard specifically.
const IRREGULAR_SINGULAR: Record<string, string> = {
  women: 'woman', men: 'man', children: 'child', kids: 'kid',
}
function canonicalize(word: string): string {
  if (IRREGULAR_SINGULAR[word]) return IRREGULAR_SINGULAR[word]
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word
}

function extractMatches(text: string, vocab: Set<string>): Set<string> {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean)
  const matches = new Set<string>()
  for (const w of words) if (vocab.has(w)) matches.add(canonicalize(w))
  return matches
}

export interface RelevanceCheck {
  allowed: boolean
  reason:  string
}

export function checkKeywordRelevance(originalQuery: string, candidateKeyword: string): RelevanceCheck {
  for (const cat of PRIMARY_CATEGORIES) {
    const originalMatches = extractMatches(originalQuery, cat.vocab)
    if (originalMatches.size === 0) continue // nothing in this category to preserve

    const candidateMatches = extractMatches(candidateKeyword, cat.vocab)
    const preserved = Array.from(originalMatches).some(m => candidateMatches.has(m))
    if (!preserved) {
      return {
        allowed: false,
        reason: `Original query specifies ${cat.name} (${Array.from(originalMatches).join(', ')}); "${candidateKeyword}" does not — likely a different market.`,
      }
    }
  }
  return { allowed: true, reason: 'No essential qualifier (species, body area, or product type) was dropped.' }
}
