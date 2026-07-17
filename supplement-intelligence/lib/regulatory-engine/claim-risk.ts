// ── DSHEA disease-claim language scanner ──────────────────────────────────
//
// Roadmap M2.19 (DSHEA claim-risk language checks). Deterministic,
// no-AI-call, no-external-API-call string scanner over real competitor
// marketing copy already fetched by Keepa and Apify (top_competitors[]
// `bullets` and `ingredients_label`). Flags candidate 21 CFR 101.93(g)
// disease-claim language for human review — this is NOT a legal
// compliance determination, see DISCLAIMER below.
//
// Grounding: 21 CFR 101.93(g) (FDA's structure/function-vs-disease-claim
// regulation) and FDA's Jan 2002 Small Entity Compliance Guide on
// Structure/Function Claims (docket FDA-1998-N-0071), both live-fetched
// and confirmed current during this milestone's R&D research phase.
//
// Design: co-occurrence, not bare keyword matching. FDA's own guide states
// directly that no single word makes a disease claim on its own — "No
// specific adjectives constitute a disease claim... words such as
// 'restore,' 'support,' 'maintain,' 'raise,' 'lower,' 'promote,'
// 'regulate,' or 'stimulate' might create an implied disease claim if, in
// the context they are used, they imply an effect on disease. Similarly,
// words like 'prevent,' 'mitigate,' 'diagnose,' 'cure,' or 'treat' would
// be disease claims if the context of their use implied an effect on a
// disease." A bare "supports the immune system" must NOT flag (FDA's own
// allowed example); "relieves crushing chest pain (angina)" MUST flag
// (FDA's own prohibited example). Same-string co-occurrence of a verb from
// CLAIM_RISK_VERBS and a term from CLAIM_RISK_DISEASE_TERMS is the
// smallest-correct-scope signal for that distinction — no NLP/proximity-
// window logic is built here.
//
// Same disclosure convention as lib/science-engine/dsld.ts's
// MAGNESIUM_RDA_RANGE_MG: named, commented, cited, explicitly non-exhaustive.

// Treatment/disease-effect verbs, drawn directly from the real quoted FDA
// examples and from FDA's own explanatory quote above. "supports" and
// "maintains" are included ONLY because FDA's guide explicitly says they
// "might create an implied disease claim" IN CONTEXT — i.e. only when
// co-occurring with a disease term below, never as bare keywords. This
// list is NOT an attempt at exhaustive coverage of every word FDA could
// ever treat as a disease-claim verb; it is limited to what is grounded in
// the real citation above.
//
// Disclosed exclusion (v1 scope decision, not a silent omission): FDA's own
// explanatory quote above also names "restore," "raise," "lower,"
// "promote," "regulate," and "stimulate" as words that MIGHT create an
// implied disease claim in context. Those six are deliberately excluded
// from v1 — they are high-false-positive-risk generic marketing/physiology
// terms with no disease-specific FDA worked example in the source material
// given for this milestone (unlike "treat," "prevent," "relieve," etc.,
// which appear directly inside the prohibited-claim example quotes). A
// narrower, more precisely grounded verb set was chosen for
// smallest-correct-scope; revisit only with a real worked example backing
// each addition.
export const CLAIM_RISK_VERBS = [
  'treat', 'treats',
  'cure', 'cures',
  'prevent', 'prevents',
  'mitigate', 'mitigates',
  'diagnose', 'diagnoses',
  'relieve', 'relieves',
  'reduce', 'reduces',
  'improve', 'improves',
  'support', 'supports',
  'maintain', 'maintains',
]

// Named disease/condition terms, drawn directly from the real quoted FDA
// prohibited-claim examples in 21 CFR 101.93(g)'s Small Entity Compliance
// Guide (docket FDA-1998-N-0071). Deliberately small and honestly sourced
// — NOT an attempt at exhaustive medical-condition coverage. Do not expand
// without a real citation grounding the addition.
export const CLAIM_RISK_DISEASE_TERMS = [
  'cancer',
  'rheumatoid arthritis',
  'arthritis',
  'angina',
  'asthma',
  'bronchospasm',
  "alzheimer's disease",
  'alzheimer disease',
  'dementia',
  'dementias',
  'infection',
  'infections',
  'depression',
  'acne',
]

export const CLAIM_RISK_DISCLAIMER =
  'Pattern-matched candidate language only, not a legal compliance determination. ' +
  'Detects verb + named-disease/condition co-occurrence per 21 CFR 101.93(g) and FDA\'s ' +
  'Jan 2002 Small Entity Compliance Guide on Structure/Function Claims (docket FDA-1998-N-0071). ' +
  'Not medical or legal advice — always verify with qualified regulatory counsel before making ' +
  'claim-language decisions.'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Real scraped Amazon/Keepa listing copy routinely uses a typographic/curly
// apostrophe (U+2019 '/ U+2018 ') rather than the straight ASCII apostrophe
// used in our own constant strings (e.g. "alzheimer's disease"). Normalize
// curly apostrophes to straight ones on the INPUT text before matching, so
// real-world copy like "Alzheimer's disease" (curly) still matches the
// straight-quote term defined above — without this, that real-world form
// would silently fail to flag.
function normalizeApostrophes(s: string): string {
  return s.replace(/[‘’]/g, "'")
}

// Word-boundary regexes, built once at module load — cheap and avoids
// rebuilding per call. \b works fine for these ASCII terms; the one
// apostrophe-bearing term ("alzheimer's disease") relies on \b at its
// start/end word edges only, which still matches correctly (input text is
// normalized to straight apostrophes before matching — see
// normalizeApostrophes above).
const VERB_PATTERNS = CLAIM_RISK_VERBS.map(
  v => new RegExp(`\\b${escapeRegex(v)}\\b`, 'i'),
)
const DISEASE_PATTERNS = CLAIM_RISK_DISEASE_TERMS.map(
  d => new RegExp(`\\b${escapeRegex(d)}\\b`, 'i'),
)

/**
 * Scans real marketing copy strings for candidate DSHEA disease-claim
 * language — a verb from CLAIM_RISK_VERBS and a term from
 * CLAIM_RISK_DISEASE_TERMS co-occurring within the same string. Returns
 * the matched source strings verbatim (deduplicated), or an empty array
 * if none match. Pure, deterministic, no AI call, no network call.
 */
export function scanForClaimRiskLanguage(texts: string[]): string[] {
  const matches: string[] = []
  const seen = new Set<string>()

  for (const text of texts) {
    if (!text || typeof text !== 'string') continue
    const normalized = normalizeApostrophes(text)
    const hasVerb = VERB_PATTERNS.some(p => p.test(normalized))
    if (!hasVerb) continue
    const hasDisease = DISEASE_PATTERNS.some(p => p.test(normalized))
    if (!hasDisease) continue

    if (!seen.has(text)) {
      seen.add(text)
      matches.push(text)
    }
  }

  return matches
}
