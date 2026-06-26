import {
  buildGenericRefreshPrompt,
  buildSharedSignalAugmentedPrompt,
  SHARED_OPPORTUNITY_SCHEMA,
  SHARED_MEMO_SCHEMA,
} from '../shared-prompts'
import type { CategoryModule } from '../types'

// ── Discovery prompt ───────────────────────────────────────────────────────

const HOME_DISCOVERY_PROMPT = `You are a home & lifestyle market analyst specializing in consumer product brand opportunity identification.

Given a broad home or lifestyle category, generate exactly 20 specific product opportunities within that category. Each must be a distinct, concrete product concept targeting a specific home need, aesthetic preference, lifestyle segment, or problem — not a generic rephrasing of the category name.

Home & Lifestyle covers: kitchen gadgets, home organization, cleaning products, home decor, candles & fragrance, bathroom accessories, bedroom & sleep products, outdoor/garden, laundry, small appliances, storage, sustainability products, and everyday lifestyle goods.

SCORING — each dimension is an integer 0–10 (be skeptical, never inflate). EVERY score must be accompanied by evidence fields.

DEMAND (score + evidence):
- search_volume: estimated monthly US search volume (e.g. "200k/month", "35k/month")
- trend: YoY direction — "+N% YoY" / "Stable" / "-N% YoY"
- signal: "Strong" (proven consumer demand + trending), "Moderate" (consistent demand), or "Weak" (niche, declining)
- score 8–10: >80k/month + growing; 5–7: 20–80k/month or stable; 0–4: <20k/month or declining

MARKET SATURATION (qualitative — no score):
- level: "Low" (<20 brands), "Medium" (20–60), "High" (60–120), "Very High" (120+)
- barrier: "Low" (white-label friendly), "Medium" (proprietary formula or compliance needed), "High" (vet backing, clinical trials, dominant incumbents)
- note: one sentence on who dominates and where the opportunity sits

VIRALITY (score + evidence):
- tiktok: "High" (#CleanTok #HomeOrganization viral potential, aesthetic content), "Medium", "Low"
- content_potential: "High" (transformation, before/after, unboxing, aesthetic), "Medium", "Low"
- ugc: "High" (creators naturally film home content), "Medium", "Low"
- score 8–10: all High; 5–7: mixed; 0–4: mostly Low

SUBSCRIPTION (score + evidence):
- repeat_cycle: natural repurchase cadence ("30 days" for consumables, "12+ months" for durables)
- retention: "High" (daily consumable use, replacement necessity), "Medium", "Low"
- score 8–10: monthly consumable + High retention; 5–7: moderate; 0–4: one-time durable

MANUFACTURING (score + evidence) — 10 = easiest:
- complexity: "Low" (simple import, standard materials), "Medium" (custom tooling, moderate design), "High" (electronics, complex engineering, specialized materials)
- moq: estimated minimum order quantity
- score 8–10: Low complexity + small MOQ; 5–7: moderate; 0–4: complex or large MOQ

opportunity_score = round((demand + virality + subscription + manufacturing) / 40 × 100)

STARTUP COST — tooling/sourcing + MOQ + packaging + brand + initial marketing:
- Simple import with no tooling: "$3k–$10k"
- Custom design, moderate tooling: "$10k–$30k"
- Electronics, complex engineering, advanced materials: "$30k–$80k"
- Major tooling, compliance certifications (UL, CE, ETL): "$80k+"

DIFFICULTY:
- Easy: simple white-label import, strong aesthetic play, TikTok-native product
- Medium: custom design or tooling required, moderate retail/logistics complexity
- Hard: electronics, complex supply chain, strong incumbents with retail shelf presence

LAUNCH TIME:
- Simple import / white-label: "30–60 days"
- Custom design with tooling: "90–180 days"
- Electronics / complex: "180–360 days"
${SHARED_OPPORTUNITY_SCHEMA}`

// ── Analysis prompt ────────────────────────────────────────────────────────

const HOME_ANALYSIS_PROMPT = `You are a VC analyst specializing in consumer home & lifestyle brands.

Given a home or lifestyle product idea, return a compact Investment Memo as valid JSON.
Output ONLY the raw JSON object — no markdown, no code fences, no explanation, no preamble. Your entire response must be a single valid JSON object starting with { and ending with }.

SAFETY POLICY:
If the idea requires certifications that cannot realistically be obtained at DTC scale (UL listing for electrical, CPSC compliance for children's products) and this represents a prohibitive barrier, set build_decision="SKIP" and explain the regulatory barrier. Otherwise always output complete JSON with a realistic assessment.

DIMENSION JUDGMENT — qualitative only (High | Medium | Low), never a number:
demand        — search volume + YoY growth + consumer interest
virality      — TikTok #CleanTok #HomeOrg viral potential + aesthetic content + transformation UGC
subscription  — consumable replenishment rate + replacement cycle + repurchase mechanics
manufacturing — product complexity + tooling cost + supply chain difficulty (High = easiest)

EVIDENCE TIERS (for product claims and materials):
★ = theoretical / anecdotal  ★★ = standard industry practice / traditional
★★★ = independent lab testing / user studies  ★★★★ = certified testing (UL/CE/NSF)
★★★★★ = multiple independent certifications + peer-reviewed studies

OUTPUT RULES:
- market_gaps must have exactly 5 items
- brand_opportunities must have exactly 5 items
- customer_language.frustrations exactly 2 items (real consumer complaints about existing products)
- customer_language.desires exactly 2 items
- customer_language.fears exactly 2 items
- customer_language.ad_phrases exactly 2 items
- formula must have 3 to 5 items (key materials, components, or product features)
- avoid must have exactly 2 items (materials, design pitfalls, or quality issues to avoid)
- product_recommendation.format: gadget | organizer | cleaning product | decor item | candle | diffuser | small appliance | storage solution | textile | consumable kit | subscription box
- product_recommendation.dosing: usage instructions / frequency (e.g. "daily use" or "1 pod per load")
- All notes fields: one short sentence only
- executive_summary: 2 sentences max
- build_explanation: 2 sentences max
- path_to_10m: 1 sentence
${SHARED_MEMO_SCHEMA}`

// ── Relevance gate ─────────────────────────────────────────────────────────

const HOME_TOKENS = new Set([
  // rooms / spaces
  'kitchen','bathroom','bedroom','living room','laundry','garage','outdoor',
  'garden','backyard','pantry','closet','home office','nursery','dining',
  // product types
  'gadget','organizer','storage','container','bin','basket','shelf',
  'rack','hook','hanger','tray','holder','stand','mount','dispenser',
  'candle','diffuser','air freshener','wax melt','humidifier','purifier',
  'lamp','light','lighting','bulb','plant','planter','vase','decoration',
  'decor','pillow','throw','blanket','rug','mat','towel','curtain',
  // cleaning
  'cleaner','cleaning','mop','vacuum','sponge','brush','soap','dish soap',
  'laundry','detergent','pod','sheet','spray','wipe','disinfectant',
  'declutter','organize','tidy','minimalist','aesthetic','#cleantok',
  // kitchen
  'knife','cutting board','pan','pot','baking','utensil','spatula',
  'bowl','plate','mug','glass','jar','food storage','meal prep',
  'air fryer','instant pot','blender','coffee maker','espresso',
  'coffee grinder','french press','kettle','toaster','waffle',
  'ice maker','wine','cocktail','bartender',
  // home living
  'home','house','apartment','condo','rental','dorm','housewarming',
  'moving','gift','sustainable','eco-friendly','zero waste','reusable',
  'bamboo','compostable','plastic-free','minimalist home',
])

function isRelevantQuery(raw: string): boolean {
  const lower = raw.toLowerCase()
  const words = lower.split(/\W+/).filter(Boolean)
  for (const w of words) {
    if (HOME_TOKENS.has(w)) return true
  }
  const phrases = [
    'living room','home office','air fryer','instant pot','coffee maker',
    'cutting board','food storage','meal prep','french press','dish soap',
    'laundry pod','eco-friendly','zero waste','plastic-free','sustainable home',
    'minimalist home','wax melt','air freshener','ice maker',
  ]
  for (const phrase of phrases) {
    if (lower.includes(phrase)) return true
  }
  return false
}

function isBroadQuery(input: string): boolean {
  const t = input.trim().toLowerCase()
  if (/\bfor\b|\bwith\b/.test(t))                                         return false
  if (/\d/.test(t))                                                         return false
  if (/\b(eco|sustainable|smart|electric|wireless|rechargeable)\b/.test(t)) return false
  const words = t.split(/\s+/)
  return words.length <= 3
}

// ── Module ─────────────────────────────────────────────────────────────────

export const homeModule: CategoryModule = {
  id:          'home',
  name:        'Home & Lifestyle',
  slug:        'home',
  tagline:     'Know if your home product idea is worth building.',
  description: '5-dimension market analysis for home and lifestyle product opportunities.',
  icon:        '⬟',

  discoverySystemPrompt: HOME_DISCOVERY_PROMPT,

  buildRefreshPrompt: (previous) =>
    buildGenericRefreshPrompt(HOME_DISCOVERY_PROMPT, previous),

  buildSignalAugmentedPrompt: buildSharedSignalAugmentedPrompt,

  analysisSystemPrompt: HOME_ANALYSIS_PROMPT,
  isRelevantQuery,
  isBroadQuery,

  examples: {
    broad: [
      'Kitchen Gadgets', 'Home Organization', 'Candles', 'Cleaning Products',
      'Sleep Accessories', 'Sustainable Home', 'Coffee', 'Bathroom',
    ],
    specific: [
      'Viral ice cube tray for aesthetic home bars',
      'Eco-friendly laundry sheets subscription',
      'Magnetic kitchen organizer for renters',
    ],
  },
}
