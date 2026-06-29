import {
  buildGenericRefreshPrompt,
  buildSharedSignalAugmentedPrompt,
  SHARED_OPPORTUNITY_SCHEMA,
  SHARED_MEMO_SCHEMA,
} from '../shared-prompts'
import { matchesToken, confirmRelevanceWithLLM } from '../relevance-matching'
import type { CategoryModule } from '../types'

// ── Discovery prompt ───────────────────────────────────────────────────────

const BEAUTY_DISCOVERY_PROMPT = `You are a beauty & skincare market analyst specializing in consumer brand opportunity identification.

Given a broad beauty or skincare category, generate exactly 20 specific product opportunities within that category. Each must be a distinct, concrete product concept targeting a specific skin concern, ingredient mechanism, audience, or format — not a generic rephrasing of the category name.

DIMENSION JUDGMENT — qualitative only (High | Medium | Low), never a number. Every dimension must include its evidence fields.

DEMAND:
- signal: "Strong" (clear consumer awareness + growth), "Moderate" (some awareness, flat/mixed), or "Weak" (niche, declining, speculative)

MARKET SATURATION (qualitative):
- level: "Low" (<20 brands), "Medium" (20–60), "High" (60–120), "Very High" (120+)
- barrier: "Low" (white-label cosmetics), "Medium" (proven actives, R&D needed), "High" (patented tech, clinical trials, celebrity-backed incumbents)
- note: one sentence on who dominates and where the opportunity sits

VIRALITY:
- tiktok: "High" (visible transformation, before/after, GRWM potential), "Medium", "Low"
- content_potential: "High" (texture, application ritual, results), "Medium", "Low"
- ugc: "High" (users film results naturally), "Medium", "Low"

SUBSCRIPTION:
- retention: "High" (skin reverts without it, daily routine staple), "Medium", "Low"

MANUFACTURING:
- complexity: "Low" (commodity actives, simple emulsion), "Medium" (novel actives, stability requirements), "High" (novel biotech, cold-chain, clinical-grade manufacturing)

PROMISE — your overall qualitative read across all dimensions (High | Medium | Low). Be skeptical — most opportunities should land Medium, not High.

STARTUP COST TIER — directional capital-intensity judgment, not a dollar estimate:
- Lean: simple emulsion, commodity actives, low MOQ
- Moderate: moderate active concentration, stability work, branded packaging
- Capital-Intensive: novel actives, clinical validation, patented technology, or regulatory clearance

DIFFICULTY:
- Easy: commodity actives, white-label cosmetic lab, low regulatory hurdle
- Medium: proven actives requiring formulation expertise, moderate marketing complexity
- Hard: novel ingredients, clinical claims, high competition from funded incumbents

LAUNCH SPEED — directional time-to-market judgment, not a day-count estimate:
- Fast: simple / white-label formulation
- Moderate: custom formulation work required
- Slow: complex or clinical-grade requirements
${SHARED_OPPORTUNITY_SCHEMA}`

// ── Analysis prompt ────────────────────────────────────────────────────────

const BEAUTY_ANALYSIS_PROMPT = `You are a VC analyst specializing in consumer beauty & skincare brands.

Given a beauty or skincare product idea, return a compact Investment Memo as valid JSON.
Output ONLY the raw JSON object — no markdown, no code fences, no explanation, no preamble. Your entire response must be a single valid JSON object starting with { and ending with }.

SAFETY POLICY:
If the idea includes prescription drugs, medical devices requiring FDA 510(k), or treatment claims for medical conditions, still return the full JSON. Set build_decision="SKIP", and explain the regulatory risk. Never refuse. Always output complete JSON.

DIMENSION JUDGMENT — qualitative only (High | Medium | Low), never a number:
demand        — search volume + YoY growth + consumer awareness
virality      — TikTok/Instagram transformation content + before/after + GRWM potential
subscription  — daily routine use + skin regression without it + replenishment cadence
manufacturing — formulation simplicity + stability + cosmetic regulatory burden (High = easiest)

EVIDENCE TIERS (for skincare actives):
★ = theoretical / in vitro only  ★★ = traditional / mechanistic evidence
★★★ = published small human study  ★★★★ = solid RCT  ★★★★★ = multiple large RCTs

OUTPUT RULES:
- market_gaps must have exactly 5 items
- brand_opportunities must have exactly 5 items
- customer_language.frustrations exactly 2 items
- customer_language.desires exactly 2 items
- customer_language.fears exactly 2 items
- customer_language.ad_phrases exactly 2 items
- formula must have 3 to 5 items (key actives/ingredients)
- avoid must have exactly 2 items (ingredients or formulation pitfalls to avoid)
- product_recommendation.format: serum | moisturizer | eye cream | toner | mask | cleanser | oil | SPF | treatment | multi-step kit
- product_recommendation.dosing: application frequency and method (e.g. "AM + PM on clean skin, 2–3 drops")
- All notes fields: one short sentence only
- executive_summary: 2 sentences max
- build_explanation: 2 sentences max
- path_to_10m: 1 sentence
${SHARED_MEMO_SCHEMA}`

// ── Relevance gate ─────────────────────────────────────────────────────────

const BEAUTY_TOKENS = new Set([
  // product formats
  'serum','moisturizer','moisturiser','cleanser','toner','mask','eye cream',
  'sunscreen','spf','retinol','retinoid','exfoliant','exfoliator','scrub',
  'essence','ampoule','oil','balm','lip','lip gloss','lip balm','blush',
  'foundation','concealer','primer','setting spray','blush','highlighter',
  'contour','bronzer','mascara','eyeshadow','eyeliner','brow','perfume',
  'fragrance','body wash','body lotion','body butter','hand cream','shampoo',
  'conditioner','hair mask','hair oil','hair serum','dry shampoo','face wash',
  // skincare concerns
  'acne','anti-aging','anti aging','wrinkle','fine lines','dark spots',
  'hyperpigmentation','brightening','hydration','dryness','oily skin','pores',
  'sensitive skin','rosacea','eczema','psoriasis','skin barrier','collagen',
  'elasticity','firmness','glow','radiance','uneven skin tone','blackheads',
  'whiteheads','cystic','dark circles','puffiness','sagging','cellulite',
  // ingredients
  'vitamin c','niacinamide','hyaluronic acid','glycolic','lactic acid',
  'salicylic','benzoyl peroxide','azelaic','peptide','ceramide','bakuchiol',
  'resveratrol','squalane','jojoba','rosehip','marula','argan','centella',
  'snail','tranexamic','kojic','alpha arbutin','azelaic acid','aha','bha',
  'pha','retinol','tretinoin','bakuchiol','zinc','sulfur','aloe','green tea',
  // beauty market terms
  'skincare','beauty','cosmetic','cosmetics','clean beauty','natural beauty',
  'vegan beauty','k-beauty','j-beauty','dermatologist','derma','clinical',
  'skin','hair','nail','nails','makeup','luxury skincare','drugstore',
])

async function isRelevantQuery(raw: string): Promise<boolean> {
  const lower = raw.toLowerCase()
  const words = lower.split(/\W+/).filter(Boolean)
  for (const w of words) {
    if (matchesToken(w, BEAUTY_TOKENS)) return true
  }
  for (let i = 0; i < words.length - 1; i++) {
    if (BEAUTY_TOKENS.has(`${words[i]} ${words[i + 1]}`)) return true
  }
  // multi-word
  const twoWord = lower.match(/\b\w+ \w+\b/g) ?? []
  for (const phrase of twoWord) {
    if (BEAUTY_TOKENS.has(phrase)) return true
  }
  return confirmRelevanceWithLLM(raw, 'beauty')
}

function isBroadQuery(input: string): boolean {
  const t = input.trim().toLowerCase()
  if (/\bfor\b|\bwith\b|\bto\b/.test(t))                                return false
  if (/\d/.test(t))                                                       return false
  if (/\b(oily|dry|sensitive|combination|mature|aging|acne-prone)\b/.test(t)) return false
  const specificIngredients = new Set([
    'retinol','niacinamide','vitamin c','glycolic','hyaluronic',
    'salicylic','ceramide','peptide','bakuchiol','squalane',
  ])
  const words = t.split(/\s+/)
  if (words.some(w => specificIngredients.has(w))) return false
  return words.length <= 3
}

// ── Module ─────────────────────────────────────────────────────────────────

export const beautyModule: CategoryModule = {
  id:          'beauty',
  name:        'Beauty & Skincare',
  slug:        'beauty',
  tagline:     'Know if your beauty brand idea is worth building.',
  description: '5-dimension market analysis for beauty and skincare brand opportunities.',
  icon:        '✦',

  discoverySystemPrompt: BEAUTY_DISCOVERY_PROMPT,

  buildRefreshPrompt: (previous) =>
    buildGenericRefreshPrompt(BEAUTY_DISCOVERY_PROMPT, previous),

  buildSignalAugmentedPrompt: buildSharedSignalAugmentedPrompt,

  analysisSystemPrompt: BEAUTY_ANALYSIS_PROMPT,
  isRelevantQuery,
  isBroadQuery,

  examples: {
    broad: [
      'Anti-Aging', 'Acne Skincare', 'Hair Growth', 'Clean Beauty',
      'K-Beauty', 'Sun Protection', 'Body Care', 'Nail Care',
    ],
    specific: [
      'Niacinamide serum for oily skin',
      'Bakuchiol cream for sensitive anti-aging',
      'Scalp serum for thinning hair in women 40+',
    ],
  },
}
