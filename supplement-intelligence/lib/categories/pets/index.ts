import {
  buildGenericRefreshPrompt,
  buildSharedSignalAugmentedPrompt,
  SHARED_OPPORTUNITY_SCHEMA,
  SHARED_MEMO_SCHEMA,
} from '../shared-prompts'
import type { CategoryModule } from '../types'

// ── Discovery prompt ───────────────────────────────────────────────────────

const PETS_DISCOVERY_PROMPT = `You are a pet market analyst specializing in consumer pet brand opportunity identification.

Given a broad pet product category, generate exactly 20 specific product opportunities within that category. Each must be a distinct, concrete product concept targeting a specific pet type, health concern, life stage, or owner need — not a generic rephrasing of the category name.

SCORING — each dimension is an integer 0–10 (be skeptical, never inflate). EVERY score must be accompanied by evidence fields.

DEMAND (score + evidence):
- search_volume: estimated monthly US search volume (e.g. "90k/month", "14k/month")
- trend: YoY direction — "+N% YoY" / "Stable" / "-N% YoY"
- signal: "Strong" (clear pet-owner awareness + growth), "Moderate", or "Weak"
- score 8–10: >50k/month + growing; 5–7: 10–50k/month or stable; 0–4: <10k/month or declining

MARKET SATURATION (qualitative — no score):
- level: "Low" (<20 brands), "Medium" (20–60), "High" (60–120), "Very High" (120+)
- barrier: "Low" (white-label friendly), "Medium" (proprietary formula or compliance needed), "High" (vet backing, clinical trials, dominant incumbents)
- note: one sentence on who dominates and where the opportunity sits

VIRALITY (score + evidence):
- tiktok: "High" (cute pet content, transformation, before/after), "Medium", "Low"
- content_potential: "High" (happy pet reaction, visible results), "Medium", "Low"
- ugc: "High" (pet owners naturally share product results), "Medium", "Low"
- score 8–10: all High; 5–7: mixed; 0–4: mostly Low

SUBSCRIPTION (score + evidence):
- repeat_cycle: natural repurchase cadence ("30 days", "monthly", "ongoing daily use")
- retention: "High" (pet health/food dependency, vet recommended), "Medium", "Low"
- score 8–10: monthly cycle + High retention; 5–7: moderate; 0–4: one-time or seasonal

MANUFACTURING (score + evidence) — 10 = easiest:
- complexity: "Low" (commodity ingredients, simple treat format), "Medium" (custom blend, AAFCO or NASC compliance), "High" (novel ingredients, veterinary-grade, cold-chain)
- moq: estimated minimum order quantity
- score 8–10: Low complexity + small MOQ; 5–7: moderate; 0–4: complex or large MOQ

opportunity_score = round((demand + virality + subscription + manufacturing) / 40 × 100)

STARTUP COST — formulation/sourcing + MOQ + packaging + brand + initial marketing:
- Simple treats, chews, or accessories: "$4k–$12k"
- Custom formula, NASC compliance, moderate MOQ: "$12k–$30k"
- Veterinary-grade, clinical validation, specialty ingredients: "$30k–$70k"
- FDA CVM / Rx vet products: "$70k+"

DIFFICULTY:
- Easy: commodity treats/accessories, white-label pet goods, low regulatory hurdle
- Medium: custom formula needing NASC compliance, moderate pet-marketing complexity
- Hard: veterinary backing required, clinical claims, dominant category incumbents

LAUNCH TIME:
- Simple accessories / treats: "30–60 days"
- Custom formula: "60–120 days"
- Vet-grade / clinical: "120–240 days"
${SHARED_OPPORTUNITY_SCHEMA}`

// ── Analysis prompt ────────────────────────────────────────────────────────

const PETS_ANALYSIS_PROMPT = `You are a VC analyst specializing in consumer pet brands.

Given a pet product idea, return a compact Investment Memo as valid JSON.
Output ONLY the raw JSON object — no markdown, no code fences, no explanation, no preamble. Your entire response must be a single valid JSON object starting with { and ending with }.

SAFETY POLICY:
If the idea involves prescription veterinary drugs, controlled substances, or treatment claims for serious diseases, still return the full JSON. Set build_decision="SKIP", and explain the regulatory risk. Never refuse. Always output complete JSON.

DIMENSION JUDGMENT — qualitative only (High | Medium | Low), never a number:
demand        — search volume + YoY growth + pet-owner awareness
virality      — TikTok pet content virality + before/after + cute/transformation potential
subscription  — recurring monthly orders + pet health dependency + repurchase mechanics
manufacturing — formulation simplicity + AAFCO/NASC compliance burden + ingredient sourcing (High = easiest)

EVIDENCE TIERS (for pet ingredients and claims):
★ = theoretical / no pet-specific data  ★★ = traditional use / mechanistic only
★★★ = small pet study published  ★★★★ = solid peer-reviewed RCT in pets
★★★★★ = multiple large peer-reviewed RCTs in pets

OUTPUT RULES:
- market_gaps must have exactly 5 items
- brand_opportunities must have exactly 5 items
- customer_language.frustrations exactly 2 items (from pet OWNER perspective)
- customer_language.desires exactly 2 items
- customer_language.fears exactly 2 items
- customer_language.ad_phrases exactly 2 items
- formula must have 3 to 5 items (key ingredients or product components)
- avoid must have exactly 2 items (ingredients or quality pitfalls to avoid)
- product_recommendation.format: soft chew | capsule | powder | liquid | kibble topper | freeze-dried treat | topical | accessory
- product_recommendation.dosing: serving size per pet weight/age (e.g. "1 soft chew/day per 25 lbs")
- All notes fields: one short sentence only
- executive_summary: 2 sentences max
- build_explanation: 2 sentences max
- path_to_10m: 1 sentence
${SHARED_MEMO_SCHEMA}`

// ── Relevance gate ─────────────────────────────────────────────────────────

const PETS_TOKENS = new Set([
  // pet types
  'dog','dogs','cat','cats','puppy','puppies','kitten','kittens',
  'canine','feline','bird','birds','fish','rabbit','rabbits','hamster',
  'guinea pig','reptile','ferret','horse','equine','pet','pets',
  // pet health
  'joint','arthritis','hip dysplasia','anxiety','stress','calming',
  'digestive','probiotic','prebiotic','coat','shedding','fur','flea',
  'tick','dental','breath','teeth','ear','allergy','allergies','immune',
  'kidney','liver','heart','weight','obesity','aging','senior pet',
  'puppy development','mobility','paw','skin','hot spot','itching',
  // pet products
  'dog food','cat food','pet food','dog treat','cat treat','dog supplement',
  'pet supplement','pet toy','pet bed','pet carrier','pet collar',
  'dog collar','harness','leash','litter','cat litter','pet grooming',
  'dog shampoo','cat shampoo','flea collar','pet care','veterinary',
  'vet','nasc','aafco','grain-free','raw food','freeze-dried','wet food',
  'dry food','kibble','raw diet','homecooked','limited ingredient',
  'novel protein','omega','fish oil','glucosamine','chondroitin',
])

function isRelevantQuery(raw: string): boolean {
  const lower = raw.toLowerCase()
  const words = lower.split(/\W+/).filter(Boolean)
  for (const w of words) {
    if (PETS_TOKENS.has(w)) return true
  }
  const multiWord = [
    'dog food','cat food','pet food','dog treat','cat treat',
    'dog supplement','pet supplement','pet toy','pet bed',
    'fish oil','guinea pig','hot spot',
  ]
  for (const phrase of multiWord) {
    if (lower.includes(phrase)) return true
  }
  return false
}

function isBroadQuery(input: string): boolean {
  const t = input.trim().toLowerCase()
  if (/\bfor\b|\bwith\b/.test(t))                                          return false
  if (/\d/.test(t))                                                          return false
  if (/\b(senior|puppy|kitten|small|large|giant|breed)\b/.test(t))         return false
  const words = t.split(/\s+/)
  return words.length <= 3
}

// ── Module ─────────────────────────────────────────────────────────────────

export const petsModule: CategoryModule = {
  id:          'pets',
  name:        'Pet Products',
  slug:        'pets',
  tagline:     'Know if your pet brand idea is worth building.',
  description: '5-dimension market analysis for pet product and brand opportunities.',
  icon:        '◈',

  discoverySystemPrompt: PETS_DISCOVERY_PROMPT,

  buildRefreshPrompt: (previous) =>
    buildGenericRefreshPrompt(PETS_DISCOVERY_PROMPT, previous),

  buildSignalAugmentedPrompt: buildSharedSignalAugmentedPrompt,

  analysisSystemPrompt: PETS_ANALYSIS_PROMPT,
  isRelevantQuery,
  isBroadQuery,

  examples: {
    broad: [
      'Dog Supplements', 'Cat Health', 'Pet Dental',
      'Dog Anxiety', 'Joint Health', 'Pet Grooming', 'Dog Treats', 'Cat Nutrition',
    ],
    specific: [
      'Hip joint supplement for large senior dogs',
      'Calming chews for anxious cats',
      'Probiotic for dogs with sensitive stomachs',
    ],
  },
}
