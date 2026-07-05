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

// ── Layer 0: Intent classification ───────────────────────────────────────────
// Deterministic regex patterns that indicate a keyword is navigational, local-
// business, or location-based rather than commercial/product-purchase intent.
// Applied BEFORE any category-drift check, and independently of whether the
// original query contains any recognized qualifier vocabulary. A keyword that
// matches any of these patterns is rejected outright regardless of volume.
//
// Rationale for each pattern:
//   near me/you/us/here — always location-based navigation, no product context
//   open [now|today|late|24h] — local-business availability queries
//   hours of operation / business hours — local-business info
//   phone number / contact number — local-business contact queries
//   directions to / how to get to — wayfinding, never product purchase
//   reservation / book a table — local-dining intent
//
// Deliberately NOT blocking: "recipe", "how to make", "what is" — these have
// genuine product-research interpretations and the false-positive rate is too
// high to justify a blanket block without further context.

const NAVIGATIONAL_PATTERNS: RegExp[] = [
  /\bnear\s+(me|you|us|here)\b/i,
  /\bopen\s+(now|today|late|24\s*h(ours?)?|until)\b/i,
  /\b(hours?\s+of\s+operation|business\s+hours?)\b/i,
  /\b(phone|contact|telephone)\s+(number|num)\b/i,
  /\bdirections?\s+to\b/i,
  /\bhow\s+to\s+get\s+to\b/i,
  /\breservation(s)?\b/i,
  /\bbook\s+a\s+table\b/i,
]

export interface IntentCheck {
  navigational: boolean
  reason: string
}

/**
 * Layer 0 relevance check: is this keyword's search intent commercial/product-
 * focused, or does it indicate navigation, local-business lookup, or location
 * queries that are irrelevant to product scoring?
 *
 * Fully deterministic — no AI, no external calls. Returns navigational: true
 * when ANY pattern matches, along with the specific reason for provenance.
 */
export function checkKeywordIntent(keyword: string): IntentCheck {
  for (const pattern of NAVIGATIONAL_PATTERNS) {
    if (pattern.test(keyword)) {
      return {
        navigational: true,
        reason: `Navigational/local intent: keyword "${keyword}" matches pattern /${pattern.source}/i — not a product purchase query`,
      }
    }
  }
  return { navigational: false, reason: '' }
}

// ── Layer 1: Semantic product relevance ──────────────────────────────────────
// Deterministic vocabulary-based check that answers: does this candidate keyword
// actually describe a physical product in the same space as the original query,
// or is it just sharing a generic word (breakfast, food, healthy) that happens
// to appear in the product name?
//
// Algorithm:
//   1. Extract "anchor words" from the product query — words specific enough to
//      narrow product identity (e.g. "creatine", but NOT "breakfast" or "bar").
//   2. If the candidate shares at least one anchor word → ACCEPT.
//   3. Otherwise fall back to a product-signal count: a keyword with ≥ 2 signals
//      from PRODUCT_FORMAT_WORDS + INGREDIENT_NUTRITION_WORDS has enough
//      purchase intent to serve as a plausible demand proxy.
//   4. A single STRONG_INGREDIENT_WORDS match is sufficient on its own —
//      specific compounds (creatine, ashwagandha, retinol…) uniquely identify
//      supplement/health-product purchase intent without a second signal.
//   5. If the product query has NO anchor words at all → skip the check (generic
//      product names like "Healthy Sleep Support" can't be protected this way).
//
// GENERIC_DESCRIPTORS: words too common/ambiguous to anchor on. A product query
// consisting only of these words (+ stopwords) has no specific identity to
// protect. These words also do NOT contribute to the signal count.

const GENERIC_DESCRIPTORS = new Set([
  // Quality / marketing adjectives
  'best', 'good', 'great', 'top', 'premium', 'advanced', 'ultimate', 'complete',
  'essential', 'pure', 'clean', 'fresh', 'raw', 'whole', 'natural', 'organic',
  'super', 'ultra', 'pro', 'max', 'plus', 'extra', 'new', 'better',
  'high', 'low', 'fast', 'quick', 'strong', 'powerful', 'effective', 'wild',
  // Generic wellness / support terms
  'health', 'healthy', 'wellness', 'support', 'boost', 'help', 'relief',
  'care', 'nutrition', 'nutritional', 'fitness', 'lifestyle', 'active', 'life',
  // Meal / time descriptors
  'breakfast', 'lunch', 'dinner', 'snack', 'snacks', 'meal', 'meals',
  'morning', 'night', 'evening', 'day', 'daily', 'week', 'weekly',
  // Generic food terms
  'food', 'foods', 'diet', 'dietary', 'recipe', 'recipes',
  // Generic product terms
  'product', 'products', 'brand', 'item', 'items',
  // Ambiguous format/container words (too common to anchor on)
  'bar', 'bars', 'drink', 'drinks', 'shot', 'shots',
  'mix', 'stack', 'system', 'kit', 'set', 'bundle', 'pack', 'packs',
  'solution', 'formula', 'blend', 'complex',
  // Broad health-condition terms (too generic — "sleep music", "energy drink",
  // "gut feeling", "joint venture" all share these words with supplement names)
  'sleep', 'energy', 'fatigue', 'focus', 'memory', 'stress', 'anxiety', 'mood',
  'immune', 'immunity', 'gut', 'joint', 'muscle', 'muscles', 'recovery',
  // Broad body-area terms
  'hair', 'skin', 'nail', 'nails', 'body', 'face',
])

// Product delivery format words. Each contributes +1 to the product-signal count.
// Not used for anchor extraction — too cross-category ("bar" = restaurant bar,
// candy bar, supplement bar; "oil" = cooking oil, essential oil, CBD oil).
const PRODUCT_FORMAT_WORDS = new Set([
  'supplement', 'supplements', 'capsule', 'capsules', 'tablet', 'tablets',
  'powder', 'powders', 'gummy', 'gummies', 'serum', 'serums', 'cream', 'creams',
  'chew', 'chews', 'softgel', 'softgels', 'patch', 'patches', 'spray', 'sprays',
  'drop', 'drops', 'liquid', 'liquids', 'tincture', 'tinctures', 'gel', 'gels',
  'bar', 'bars', 'strip', 'strips', 'oil', 'oils', 'extract', 'extracts',
  'stick', 'sticks', 'sachet', 'sachets', 'shake', 'shakes',
  'treatment', 'treatments', 'aid', 'aids',
  'mask', 'masks',   // hair mask, scalp mask, face mask — beauty product format
])

// Supplement, nutritional, and health-condition terms that specifically indicate
// health/supplement purchase intent. Each contributes +1 to the signal count.
// A keyword with ≥ 2 signals has product-purchase intent even if it shares no
// anchor word with the product query (e.g. "protein" + "bar" = 2 signals).
// Note: broad terms like "sleep", "energy", "gut" are in GENERIC_DESCRIPTORS
// above and are NOT here — they need to pair with a format word to signal intent.
const INGREDIENT_NUTRITION_WORDS = new Set([
  // Macronutrients and key workout compounds
  'protein', 'proteins', 'creatine', 'collagen', 'whey', 'casein',
  'amino', 'leucine', 'bcaa', 'glutamine', 'carnitine', 'taurine', 'arginine',
  'fiber', 'fibre', 'omega', 'dha', 'epa',
  // Vitamins and minerals (specific names)
  'magnesium', 'calcium', 'zinc', 'iron', 'potassium',
  'vitamin', 'vitamins', 'mineral', 'minerals', 'biotin', 'folate', 'folic',
  'b12', 'd3', 'k2', 'niacin',
  // Herbal and functional ingredients
  'melatonin', 'theanine', 'caffeine', 'ashwagandha', 'rhodiola', 'ginseng',
  'turmeric', 'curcumin', 'cbd', 'quercetin', 'berberine', 'resveratrol',
  'coq10', 'nac', 'glutathione', 'probiotic', 'probiotics', 'prebiotic', 'prebiotics',
  'electrolyte', 'electrolytes',
  // Skincare actives
  'retinol', 'hyaluronic', 'peptide', 'peptides', 'niacinamide',
  'salicylic', 'glycolic', 'ceramide', 'ceramides', 'bakuchiol', 'squalane',
  // Broad health-condition and body-area terms. These ARE in GENERIC_DESCRIPTORS
  // (can never be anchor words), but they DO count as signals here — they must
  // pair with a format word: "sleep supplement" → 2 signals → ACCEPT;
  // "sleep recipes" → 1 signal → REJECT.
  'sleep', 'energy', 'fatigue', 'focus', 'memory', 'stress', 'anxiety', 'mood',
  'immune', 'immunity', 'gut', 'joint', 'muscle', 'muscles', 'recovery',
  'hair', 'skin', 'nail', 'nails', 'face', 'body',
  // More specific conditions / body areas
  'scalp', 'microbiome', 'postpartum', 'prenatal', 'postnatal', 'menopausal', 'menopause',
  'inflammation', 'digestion', 'digestive', 'bloating', 'hormonal', 'testosterone',
  // Specific chemical salt forms (only appear in supplement contexts)
  'glycinate', 'citrate', 'malate', 'bisglycinate', 'threonate', 'acetate',
  // Diet types used as product qualifiers
  'keto', 'ketogenic', 'paleo', 'vegan',
])

// Specific compounds whose single presence is sufficient to establish supplement-
// product intent at scoring time (no second signal required). Used when there is
// no product-query context to anchor on. Restricted to terms that essentially
// never appear outside a supplement/health-product search.
const STRONG_INGREDIENT_WORDS = new Set([
  'creatine', 'collagen', 'magnesium', 'melatonin', 'ashwagandha', 'rhodiola',
  'theanine', 'biotin', 'quercetin', 'berberine', 'resveratrol', 'curcumin',
  'coq10', 'nac', 'glutathione', 'turmeric', 'cbd',
  'retinol', 'hyaluronic', 'niacinamide', 'salicylic', 'bakuchiol', 'squalane',
  'glycinate', 'citrate', 'malate', 'bisglycinate', 'threonate',
  'bcaa', 'glutamine', 'carnitine', 'taurine', 'leucine',
  'probiotic', 'probiotics', 'prebiotic', 'prebiotics',
  'electrolyte', 'electrolytes', 'microbiome',
  'peptide', 'peptides',   // audit finding: peptide-keyw rejections were false negatives
])

const SEMANTIC_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'be', 'it',
  'this', 'that', 'my', 'your', 'up', 'do', 'what', 'how',
])

function semanticTokens(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 1 && !SEMANTIC_STOPWORDS.has(w))
}

/**
 * Fraction of the product query's semantic tokens that appear in the keyword.
 * Returns [0, 1]. Used to discount search volume in the Review Moat signal when
 * the top DataForSEO keyword is a broad category term rather than a product-
 * specific query.
 *
 * Unlike extractAnchorWords (which strips GENERIC_DESCRIPTORS), this uses the
 * full semantic token set so that format/descriptor words from the product query
 * ("bar", "breakfast") contribute to the specificity ratio — they ARE meaningful
 * differentiators between "creatine" (category) and "creatine breakfast bar"
 * (specific format), even if they cannot serve as anchor words for category-
 * drift detection.
 *
 * Returns 1.0 when product query has no semantic tokens (nothing to compare).
 */
export function keywordSpecificity(productQuery: string, keyword: string): number {
  const pqTokens = semanticTokens(productQuery)
  if (pqTokens.length === 0) return 1.0
  const pqSet    = new Set(pqTokens)
  const kwSet    = new Set(semanticTokens(keyword))
  const overlap  = pqTokens.filter(t => kwSet.has(t)).length
  return overlap / pqSet.size
}

function extractAnchorWords(productQuery: string): Set<string> {
  const anchors = new Set<string>()
  for (const word of semanticTokens(productQuery)) {
    if (!GENERIC_DESCRIPTORS.has(word)) anchors.add(word)
  }
  return anchors
}

function countProductSignals(keyword: string): number {
  let n = 0
  for (const word of semanticTokens(keyword)) {
    if (PRODUCT_FORMAT_WORDS.has(word) || INGREDIENT_NUTRITION_WORDS.has(word)) n++
  }
  return n
}

function hasStrongIngredient(keyword: string): boolean {
  return semanticTokens(keyword).some(w => STRONG_INGREDIENT_WORDS.has(w))
}

/**
 * Layer 1 relevance check (fetch time): does the candidate keyword actually
 * describe a product in the same space as the original query?
 *
 * No AI, no external calls. Fully deterministic.
 */
export function checkKeywordSemanticRelevance(
  productQuery: string,
  candidateKeyword: string,
): RelevanceCheck {
  const anchors = extractAnchorWords(productQuery)

  // Product query is all-generic — nothing specific to protect.
  if (anchors.size === 0) {
    return { allowed: true, reason: 'Product query has no specific anchor terms; semantic check skipped.' }
  }

  // Anchor match → the keyword refers to the same specific product type.
  const kwTokens = new Set(semanticTokens(candidateKeyword))
  const matched = Array.from(anchors).find(a => kwTokens.has(a))
  if (matched) {
    return { allowed: true, reason: `Keyword shares anchor term "${matched}" with the product query.` }
  }

  // Fallback: ≥ 2 product signals = purchase intent without an anchor match.
  const signals = countProductSignals(candidateKeyword)
  if (signals >= 2) {
    return { allowed: true, reason: `No anchor word match, but keyword has ${signals} product signals (format/ingredient terms).` }
  }

  return {
    allowed: false,
    reason: `"${candidateKeyword}" shares no specific terms with the product query and has only ${signals} product signal(s) — likely a generic or off-category search, not a product purchase query.`,
  }
}

/**
 * Scoring-time product-intent check: is this keyword likely a supplement/health
 * product purchase query? Used in computeDemand where no product-query context
 * is available (MemoData doesn't carry the original user input).
 *
 * Accepts when:
 *   - a STRONG_INGREDIENT_WORDS term is present (e.g. "creatine" alone), OR
 *   - ≥ 2 signals from PRODUCT_FORMAT_WORDS ∪ INGREDIENT_NUTRITION_WORDS
 *     (e.g. "protein"+"bar", "sleep"+"supplement", "magnesium"+"glycinate")
 */
export function checkKeywordProductSignals(keyword: string): { valid: boolean; reason: string } {
  if (hasStrongIngredient(keyword)) {
    return { valid: true, reason: 'Contains a strong supplement ingredient/compound term.' }
  }
  const signals = countProductSignals(keyword)
  if (signals >= 2) {
    return { valid: true, reason: `${signals} product signals (format/ingredient terms) indicate purchase intent.` }
  }
  return {
    valid: false,
    reason: `Only ${signals} product signal(s) — keyword is too generic to serve as a reliable product demand proxy.`,
  }
}

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
  // Layer 0: intent must be commercial/product before checking category drift.
  const intent = checkKeywordIntent(candidateKeyword)
  if (intent.navigational) return { allowed: false, reason: intent.reason }

  // Layer 1: semantic product relevance — does the keyword describe a product
  // in the same space, or is it only sharing generic words like "breakfast"?
  const semantic = checkKeywordSemanticRelevance(originalQuery, candidateKeyword)
  if (!semantic.allowed) return semantic

  // Layer 2: category-drift check — ensure essential qualifiers (species, body
  // area, product type, demographic) from the original query are preserved.
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
