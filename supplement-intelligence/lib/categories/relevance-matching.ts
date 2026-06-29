// ── Shared relevance-gate word matching ──────────────────────────────────
//
// ROOT CAUSE (found 2026-06-28 production audit): every category module's
// isRelevantQuery() does an EXACT Set-membership check against its own
// single-word token list (HOME_TOKENS, FITNESS_TOKENS, PETS_TOKENS,
// BEAUTY_TOKENS, SUPPLEMENT_TOKENS) with no plural/stemming tolerance.
// CONFIRMED VIA LIVE CALL: HOME_TOKENS has 'curtain' but not 'curtains' —
// "blackout curtains for shift workers" (a completely legitimate home
// product) was rejected, while the singular "blackout curtain for shift
// workers" was accepted. The same exact-match gap exists in all 5 modules
// for any singular/plural pair not both explicitly listed.
//
// This is NOT a full stemmer (no new dependency, no redesign of the
// per-category vocab/multi-word-phrase mechanisms, which are left
// untouched) — it only adds tolerance for the common English plural
// patterns that caused a real, reproduced false negative, checked in
// BOTH directions so it doesn't matter which form a vocab list happens to
// already contain.
function pluralVariants(word: string): string[] {
  const variants = [word]
  if (word.endsWith('ies') && word.length > 4) variants.push(word.slice(0, -3) + 'y')   // berries -> berry
  if (word.endsWith('es') && word.length > 3)  variants.push(word.slice(0, -2))          // boxes -> box
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) variants.push(word.slice(0, -1)) // curtains -> curtain
  if (!word.endsWith('s')) {
    variants.push(`${word}s`)
    if (/[^aeiou]y$/.test(word)) variants.push(`${word.slice(0, -1)}ies`)               // berry -> berries
  }
  return variants
}

/** Exact match, or match after simple singular<->plural normalization in
 *  either direction. Use in place of a bare `vocab.has(word)` check. */
export function matchesToken(word: string, vocab: Set<string>): boolean {
  if (vocab.has(word)) return true
  return pluralVariants(word).some(v => vocab.has(v))
}

// ── LLM relevance fallback ────────────────────────────────────────────────
//
// ROOT CAUSE (found 2026-06-28, 100-case production simulation + a manually
// reproduced hair-loss query): the plural/stemming fix above closes ONE
// specific gap, but the deeper problem is structural — isRelevantQuery() in
// every module is a closed, hand-curated word list. CONFIRMED VIA LIVE
// CALL: "dark spot corrector", "blue light face mist" (beauty), "ankle
// weights", "weighted vest for walking" (fitness), "shower head filter",
// "smart plug", "mattress topper for back pain" (home) were all rejected —
// none of "corrector"/"mist"/"ankle"/"weight(s)"/"vest"/"walking"/"shower"/
// "filter"/"smart"/"plug"/"mattress"/"topper" exist in any vocab list, and
// never will for every real product word in an open-ended consumer market.
// Manually reproduced separately: a hair-loss product was rejected by
// BEAUTY_TOKENS for the same reason ("hair" only exists there as part of
// fixed multi-word phrases like 'hair mask'/'hair oil', not as its own
// token, and "loss" never appears at all).
//
// This is the same problem lib/categories/open-discovery/classifier.ts
// already solved for Open Discovery: a fast, free keyword pass first, and
// only when that finds no signal, an LLM fallback (claude-haiku) that
// actually understands the query instead of pattern-matching it. Reused
// here for the explicit-category-selection path, which never had that
// fallback — module.isRelevantQuery() only ran the closed-vocabulary check
// and returned false. The fast vocabulary check in every module is left
// completely in place and still runs FIRST (free, instant, handles the
// common case and every fix from this session) — this is called ONLY when
// that check already returned false, so it adds zero cost to a query that
// already matches.
import Anthropic from '@anthropic-ai/sdk'

// Same five category definitions used by the Open Discovery classifier's
// own LLM fallback (lib/categories/open-discovery/classifier.ts) — kept as
// an independent small constant here rather than importing across modules,
// so this fix doesn't touch the already-working Open Discovery classifier
// at all.
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  supplements: 'dietary supplements, vitamins, minerals, adaptogens, protein powders as supplements, nootropics, herbal extracts',
  beauty: 'skincare, cosmetics, haircare, makeup, fragrance, personal care (non-nutritional)',
  pets: 'pet food, pet treats, pet supplements, pet accessories, pet health products',
  fitness: 'sports equipment, gym accessories, sportswear, athletic gear, sports nutrition (pre/post-workout), fitness tools',
  home: 'kitchen gadgets, home organization, cleaning products, home decor, candles, small appliances, lifestyle goods',
}

/**
 * Called only when the fast vocabulary check already returned false.
 * Defaults to ALLOW on any error or ambiguous response — an LLM-call
 * failure is a transient infra issue, not evidence the query is off-topic,
 * and the existing per-user analysis-slot limit already bounds how many
 * queries any one user can push through regardless of this check.
 */
export async function confirmRelevanceWithLLM(query: string, categoryId: string): Promise<boolean> {
  const description = CATEGORY_DESCRIPTIONS[categoryId]
  if (!description) return true

  try {
    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await ai.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        system: `You decide if a product idea plausibly belongs to ONE category: ${categoryId} (${description}). Reply with exactly YES or NO — nothing else.`,
        messages: [{ role: 'user', content: query }],
      },
      { signal: AbortSignal.timeout(8_000) },
    )
    const raw = (msg.content[0].type === 'text' ? msg.content[0].text : '').trim().toUpperCase()
    if (raw.startsWith('NO')) return false
    return true // YES, or any unparseable response — see default-allow reasoning above
  } catch {
    return true
  }
}
