import {
  buildGenericRefreshPrompt,
  buildSharedSignalAugmentedPrompt,
  SHARED_OPPORTUNITY_SCHEMA,
  SHARED_MEMO_SCHEMA,
} from '../shared-prompts'
import { matchesToken, confirmRelevanceWithLLM } from '../relevance-matching'
import type { CategoryModule } from '../types'

// ── Discovery prompt ───────────────────────────────────────────────────────

const FITNESS_DISCOVERY_PROMPT = `You are a fitness & sports market analyst specializing in consumer brand opportunity identification.

Given a broad fitness or sports category, generate exactly 20 specific product opportunities within that category. Each must be a distinct, concrete product concept targeting a specific athlete type, training goal, recovery mechanism, or sport — not a generic rephrasing of the category name.

Include both physical products (equipment, accessories, apparel) and consumables (sports nutrition, hydration, recovery supplements) where appropriate.

DIMENSION JUDGMENT — qualitative only (High | Medium | Low), never a number. Every dimension must include its evidence fields.

DEMAND:
- signal: "Strong" (clear fitness-consumer awareness + growth), "Moderate", or "Weak"

MARKET SATURATION (qualitative):
- level: "Low" (<20 brands), "Medium" (20–60), "High" (60–120), "Very High" (120+)
- barrier: "Low" (white-label gear/supplements), "Medium" (proprietary formula or engineering), "High" (patents, celebrity athletes, dominant incumbents like Nike/Optimum Nutrition)
- note: one sentence on who dominates and where the opportunity sits

VIRALITY:
- tiktok: "High" (workout transformation, challenge potential, visible results), "Medium", "Low"
- content_potential: "High" (before/after, workout demo, performance proof), "Medium", "Low"
- ugc: "High" (athletes naturally film themselves training), "Medium", "Low"

SUBSCRIPTION:
- retention: "High" (daily training dependency, recurring nutrition), "Medium", "Low"

MANUFACTURING:
- complexity: "Low" (commodity sports nutrition, simple accessories), "Medium" (custom engineering, GMP sports nutrition), "High" (advanced materials, electronics, clinical-grade)

PROMISE — your overall qualitative read across all dimensions (High | Medium | Low). Be skeptical — most opportunities should land Medium, not High.

STARTUP COST TIER — directional capital-intensity judgment, not a dollar estimate:
- Lean: commodity sports nutrition or simple accessories
- Moderate: custom formula or moderate product engineering
- Capital-Intensive: advanced materials, clinical sports trials, electronics, or medical-grade equipment

DIFFICULTY:
- Easy: commodity supplements (whey, creatine), simple accessories, white-label fitness goods
- Medium: custom formulation, moderate R&D, niche sport positioning
- Hard: novel ingredients with clinical claims, advanced equipment, competing with established athletes brands

LAUNCH SPEED — directional time-to-market judgment, not a day-count estimate:
- Fast: simple nutrition / accessories
- Moderate: custom formula or moderate product engineering
- Slow: complex engineering requirements
${SHARED_OPPORTUNITY_SCHEMA}`

// ── Analysis prompt ────────────────────────────────────────────────────────

const FITNESS_ANALYSIS_PROMPT = `You are a VC analyst specializing in consumer fitness & sports brands.

Given a fitness or sports product idea, return a compact Investment Memo as valid JSON.
Output ONLY the raw JSON object — no markdown, no code fences, no explanation, no preamble. Your entire response must be a single valid JSON object starting with { and ending with }.

SAFETY POLICY:
If the idea includes banned performance-enhancing substances, prescription drugs, or medical device claims, still return the full JSON. Set build_decision="SKIP", and explain the regulatory risk. Never refuse. Always output complete JSON.

DIMENSION JUDGMENT — qualitative only (High | Medium | Low), never a number:
demand        — search volume + YoY growth + athlete/consumer awareness
virality      — TikTok workout transformation + challenge potential + athlete UGC
subscription  — recurring training usage + monthly replenishment mechanics
manufacturing — product/formula simplicity + sports regulatory burden (High = easiest)

EVIDENCE TIERS (for sports ingredients and claims):
★ = theoretical / no sports-specific data  ★★ = traditional/mechanistic evidence
★★★ = small sports study published  ★★★★ = solid peer-reviewed RCT in athletes
★★★★★ = multiple large RCTs, ISSN or NSCA supported

For equipment/accessories, use evidence tiers to reflect engineering validation:
★ = prototype only  ★★ = user testing  ★★★ = peer-reviewed material science  ★★★★★ = clinical biomechanics trials

OUTPUT RULES:
- market_gaps must have exactly 5 items
- brand_opportunities must have exactly 5 items
- customer_language.frustrations exactly 2 items
- customer_language.desires exactly 2 items
- customer_language.fears exactly 2 items
- customer_language.ad_phrases exactly 2 items
- formula must have 3 to 5 items (key ingredients/components/materials)
- avoid must have exactly 2 items (ingredients, materials, or design pitfalls to avoid)
- product_recommendation.format: powder | capsule | ready-to-drink | bar | gel | equipment | accessory | apparel | wearable | recovery tool
- product_recommendation.dosing: usage protocol (e.g. "1 scoop 30 min pre-workout" or "use 3x/week")
- All notes fields: one short sentence only
- executive_summary: 2 sentences max
- build_explanation: 2 sentences max
- path_to_10m: 1 sentence
${SHARED_MEMO_SCHEMA}`

// ── Relevance gate ─────────────────────────────────────────────────────────

const FITNESS_TOKENS = new Set([
  // activity types
  'gym','workout','exercise','fitness','training','strength','cardio',
  'running','cycling','swimming','yoga','pilates','crossfit','hiit',
  'powerlifting','weightlifting','bodybuilding','calisthenics','sport','sports',
  'athletic','athlete','marathon','triathlon','spartan','competition',
  'hiking','climbing','rowing','tennis','basketball','soccer','football',
  'golf','boxing','martial arts','mma','bjj','wrestling','dance',
  // sports nutrition
  // ROOT CAUSE (found 2026-06-28 production audit): "EAA supplement" was
  // rejected — 'bcaa' (Branched-Chain Amino Acids) was already listed but
  // its sibling abbreviation 'eaa' (Essential Amino Acids), an equally
  // common real sports-nutrition term, was simply missing from the list.
  'pre-workout','preworkout','post-workout','protein powder','whey','casein',
  'creatine','bcaa','bcaas','eaa','eaas','amino acid','electrolyte','hydration','energy drink',
  'sports drink','recovery drink','mass gainer','fat burner','thermogenic',
  'caffeine','beta-alanine','citrulline','arginine','glutamine',
  // fitness equipment
  'resistance band','dumbbell','kettlebell','barbell','bench press',
  'pull-up bar','yoga mat','foam roller','massage gun','jump rope',
  'treadmill','stationary bike','rowing machine','gymnastics ring',
  'weightlifting belt','knee sleeve','wrist wrap','lifting straps',
  'sports bra','compression','athletic wear','leggings','shorts',
  // recovery
  'recovery','muscle soreness','doms','ice bath','sauna','stretching',
  'mobility','flexibility','injury prevention','physical therapy',
  'massage','trigger point','heat therapy','cold therapy','red light',
  // wellness fitness
  'sleep recovery','stress recovery','performance','endurance','stamina',
  'muscle gain','fat loss','body composition','lean muscle','bulk','cut',
  'weight training','functional fitness','performance nutrition',
])

async function isRelevantQuery(raw: string): Promise<boolean> {
  const lower = raw.toLowerCase()
  const words = lower.split(/\W+/).filter(Boolean)
  for (const w of words) {
    if (matchesToken(w, FITNESS_TOKENS)) return true
  }
  const multiWord = [
    'pre-workout','post-workout','protein powder','mass gainer','fat burner',
    'resistance band','yoga mat','foam roller','massage gun','jump rope',
    'sports bra','sports drink','energy drink','recovery drink',
    'bcaa','amino acid','beta-alanine','ice bath','red light',
    'trigger point','heat therapy','cold therapy','body composition',
    'lean muscle','weight training','functional fitness',
    'performance nutrition','injury prevention','physical therapy',
  ]
  for (const phrase of multiWord) {
    if (lower.includes(phrase)) return true
  }
  return confirmRelevanceWithLLM(raw, 'fitness')
}

function isBroadQuery(input: string): boolean {
  const t = input.trim().toLowerCase()
  if (/\bfor\b|\bwith\b/.test(t))                                         return false
  if (/\d/.test(t))                                                         return false
  if (/\b(beginner|advanced|women|men|runner|lifter|athlete)\b/.test(t))  return false
  const specificTerms = new Set([
    'creatine','bcaa','citrulline','beta-alanine','whey','casein',
    'kettlebell','dumbbell','barbell',
  ])
  const words = t.split(/\s+/)
  if (words.some(w => specificTerms.has(w))) return false
  return words.length <= 3
}

// ── Module ─────────────────────────────────────────────────────────────────

export const fitnessModule: CategoryModule = {
  id:          'fitness',
  name:        'Fitness & Sports',
  slug:        'fitness',
  tagline:     'Know if your fitness brand idea is worth building.',
  description: '5-dimension market analysis for fitness and sports brand opportunities.',
  icon:        '⬡',

  discoverySystemPrompt: FITNESS_DISCOVERY_PROMPT,

  buildRefreshPrompt: (previous) =>
    buildGenericRefreshPrompt(FITNESS_DISCOVERY_PROMPT, previous),

  buildSignalAugmentedPrompt: buildSharedSignalAugmentedPrompt,

  analysisSystemPrompt: FITNESS_ANALYSIS_PROMPT,
  isRelevantQuery,
  isBroadQuery,

  examples: {
    broad: [
      'Pre-Workout', 'Recovery', 'Running Gear', 'Yoga',
      'Strength Training', 'Sports Nutrition', 'Mobility', 'Hydration',
    ],
    specific: [
      'Magnesium glycinate for post-workout recovery',
      'Resistance bands for home gym women 30+',
      'Collagen protein for endurance runners',
    ],
  },
}
