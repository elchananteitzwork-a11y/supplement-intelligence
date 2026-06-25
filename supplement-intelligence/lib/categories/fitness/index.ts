import {
  buildGenericRefreshPrompt,
  buildSharedSignalAugmentedPrompt,
  SHARED_OPPORTUNITY_SCHEMA,
  SHARED_MEMO_SCHEMA,
} from '../shared-prompts'
import type { CategoryModule } from '../types'

// ── Discovery prompt ───────────────────────────────────────────────────────

const FITNESS_DISCOVERY_PROMPT = `You are a fitness & sports market analyst specializing in consumer brand opportunity identification.

Given a broad fitness or sports category, generate exactly 20 specific product opportunities within that category. Each must be a distinct, concrete product concept targeting a specific athlete type, training goal, recovery mechanism, or sport — not a generic rephrasing of the category name.

Include both physical products (equipment, accessories, apparel) and consumables (sports nutrition, hydration, recovery supplements) where appropriate.

SCORING — each dimension is an integer 0–10 (be skeptical, never inflate). EVERY score must be accompanied by evidence fields.

DEMAND (score + evidence):
- search_volume: estimated monthly US search volume (e.g. "110k/month", "22k/month")
- trend: YoY direction — "+N% YoY" / "Stable" / "-N% YoY"
- signal: "Strong" (clear fitness-consumer awareness + growth), "Moderate", or "Weak"
- score 8–10: >50k/month + growing; 5–7: 10–50k/month or stable; 0–4: <10k/month or declining

MARKET SATURATION (qualitative — no score):
- level: "Low" (<20 brands), "Medium" (20–60), "High" (60–120), "Very High" (120+)
- barrier: "Low" (white-label gear/supplements), "Medium" (proprietary formula or engineering), "High" (patents, celebrity athletes, dominant incumbents like Nike/Optimum Nutrition)
- note: one sentence on who dominates and where the opportunity sits

VIRALITY (score + evidence):
- tiktok: "High" (workout transformation, challenge potential, visible results), "Medium", "Low"
- content_potential: "High" (before/after, workout demo, performance proof), "Medium", "Low"
- ugc: "High" (athletes naturally film themselves training), "Medium", "Low"
- score 8–10: all High; 5–7: mixed; 0–4: mostly Low

SUBSCRIPTION (score + evidence):
- repeat_cycle: natural repurchase cadence ("30 days", "60 days", "monthly", "one-time")
- retention: "High" (daily training dependency, recurring nutrition), "Medium", "Low"
- score 8–10: monthly replenishment + High retention; 5–7: moderate; 0–4: one-time purchase

MANUFACTURING (score + evidence) — 10 = easiest:
- complexity: "Low" (commodity sports nutrition, simple accessories), "Medium" (custom engineering, GMP sports nutrition), "High" (advanced materials, electronics, clinical-grade)
- moq: estimated minimum order quantity
- score 8–10: Low complexity + small MOQ; 5–7: moderate; 0–4: complex or large MOQ

opportunity_score = round((demand + virality + subscription + manufacturing) / 40 × 100)

STARTUP COST:
- Commodity sports nutrition or simple accessories: "$5k–$15k"
- Custom formula or moderate product engineering: "$15k–$40k"
- Advanced materials, clinical sports trials, electronics: "$40k–$100k"
- High-complexity equipment or medical-grade: "$100k+"

DIFFICULTY:
- Easy: commodity supplements (whey, creatine), simple accessories, white-label fitness goods
- Medium: custom formulation, moderate R&D, niche sport positioning
- Hard: novel ingredients with clinical claims, advanced equipment, competing with established athletes brands

LAUNCH TIME:
- Simple nutrition / accessories: "30–60 days"
- Custom formula or moderate product: "60–120 days"
- Complex engineering: "120–240 days"
${SHARED_OPPORTUNITY_SCHEMA}`

// ── Analysis prompt ────────────────────────────────────────────────────────

const FITNESS_ANALYSIS_PROMPT = `You are a VC analyst specializing in consumer fitness & sports brands.

Given a fitness or sports product idea, return a compact Investment Memo as valid JSON.
Output ONLY the raw JSON object — no markdown, no code fences, no explanation, no preamble. Your entire response must be a single valid JSON object starting with { and ending with }.

SAFETY POLICY:
If the idea includes banned performance-enhancing substances, prescription drugs, or medical device claims, still return the full JSON. Set build_decision="SKIP", build_verdict="NO", and explain the regulatory risk. Never refuse. Always output complete JSON.

SCORING (integers 0–10, be skeptical, never inflate):
demand        — search volume + YoY growth + athlete/consumer awareness
virality      — TikTok workout transformation + challenge potential + athlete UGC
subscription  — recurring training usage + monthly replenishment mechanics
manufacturing — product/formula simplicity + sports regulatory burden (10 = easiest)

opportunity_score = round((demand + virality + subscription + manufacturing) / 40 × 100)
build_decision: ≥65 = "BUILD_NOW", 50–64 = "VALIDATE_FURTHER", <50 = "SKIP"

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
  'pre-workout','preworkout','post-workout','protein powder','whey','casein',
  'creatine','bcaa','amino acid','electrolyte','hydration','energy drink',
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

function isRelevantQuery(raw: string): boolean {
  const lower = raw.toLowerCase()
  const words = lower.split(/\W+/).filter(Boolean)
  for (const w of words) {
    if (FITNESS_TOKENS.has(w)) return true
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
  return false
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
