import Anthropic from '@anthropic-ai/sdk'

// ── Open Discovery classifier ──────────────────────────────────────────────
//
// Routes an uncategorized user query to the most appropriate category module.
//
// Strategy:
//   1. Fast path: keyword matching (free, < 1ms)
//   2. Fallback: claude-haiku classification (~500ms, used for ambiguous inputs)
//
// All valid categoryIds must be registered in lib/categories/index.ts.

const VALID_CATEGORY_IDS = ['supplements', 'beauty', 'pets', 'fitness', 'home'] as const
type KnownCategoryId = typeof VALID_CATEGORY_IDS[number]

// ── Keyword signal tables ──────────────────────────────────────────────────
// Each entry is a set of distinctive tokens for that category.
// Shared terms (e.g. "health") are intentionally omitted — only use words
// that strongly predict a specific category over the others.

const SIGNALS: Record<KnownCategoryId, string[]> = {
  supplements: [
    'supplement','supplements','vitamin','vitamins','mineral','probiotic',
    'prebiotic','omega','adaptogen','nootropic','nutraceutical','capsule',
    'gummy','softgel','tincture','ashwagandha','magnesium','melatonin',
    'creatine','berberine','inositol','collagen','biotin','rhodiola',
    'turmeric','curcumin','coq10','nad','d3','b12','maca','ginseng',
    'lion\'s mane','reishi','spirulina','chlorella','elderberry',
  ],
  beauty: [
    'serum','moisturizer','moisturiser','cleanser','toner','retinol',
    'niacinamide','spf','sunscreen','eye cream','exfoliant','hyaluronic',
    'ceramide','peptide','skincare','makeup','cosmetic','foundation',
    'concealer','mascara','lipstick','blush','bronzer','highlighter',
    'shampoo','conditioner','hair mask','hair oil','perfume','fragrance',
    'acne','anti-aging','wrinkle','pores','brightening','hyperpigmentation',
    'k-beauty','clean beauty','glowy','glow','dull skin','dark spots',
  ],
  pets: [
    'dog','dogs','cat','cats','puppy','puppies','kitten','kittens',
    'canine','feline','pet','pets','pooch','furry','paw','paws',
    'kibble','treat','collar','harness','leash','litter','flea','tick',
    'vet','veterinary','aafco','nasc','glucosamine','chondroitin',
    'joint dog','coat shine','dog anxiety','cat anxiety','dog food',
    'cat food','bird','rabbit','hamster','fish tank','aquarium',
  ],
  fitness: [
    'workout','gym','exercise','training','pre-workout','post-workout',
    'protein powder','whey','creatine','bcaa','electrolyte','sports drink',
    'resistance band','yoga mat','foam roller','kettlebell','dumbbell',
    'running','cycling','yoga','pilates','crossfit','hiit','powerlifting',
    'bodybuilding','marathon','triathlon','athletic','recovery drink',
    'muscle gain','fat loss','endurance','stamina','performance',
    'massage gun','compression','sportswear','gym bag',
  ],
  home: [
    'kitchen','bathroom','bedroom','living room','home office','laundry',
    'garden','pantry','closet','organizer','storage','candle','diffuser',
    'cleaning','cleaner','mop','vacuum','sponge','dish soap','detergent',
    'air fryer','instant pot','coffee maker','blender','toaster','kettle',
    'sustainable','eco-friendly','zero waste','reusable','bamboo',
    'gadget','decor','pillow','blanket','rug','planter','vase','lamp',
    'wax melt','humidifier','purifier','laundry pod','tidy','declutter',
  ],
}

// ── Keyword scoring ────────────────────────────────────────────────────────

function scoreByKeywords(input: string): Record<KnownCategoryId, number> {
  const lower = input.toLowerCase()
  const tokens = lower.split(/\W+/).filter(Boolean)
  const scores = Object.fromEntries(
    VALID_CATEGORY_IDS.map(id => [id, 0])
  ) as Record<KnownCategoryId, number>

  for (const id of VALID_CATEGORY_IDS) {
    for (const signal of SIGNALS[id]) {
      if (signal.includes(' ')) {
        if (lower.includes(signal)) scores[id] += 2
      } else {
        if (tokens.includes(signal)) scores[id] += 1
      }
    }
  }
  return scores
}

function pickBestKeywordMatch(
  scores: Record<KnownCategoryId, number>,
): KnownCategoryId | null {
  const sorted = (Object.entries(scores) as [KnownCategoryId, number][])
    .sort((a, b) => b[1] - a[1])

  const [first, second] = sorted
  if (first[1] === 0) return null          // no signal at all
  if (first[1] === second[1]) return null  // ambiguous tie
  return first[0]
}

// ── LLM fallback classifier ────────────────────────────────────────────────

const CLASSIFY_SYSTEM = `You are a product category classifier. Given a user's product query, output ONLY the single best category ID from this list:

supplements — dietary supplements, vitamins, minerals, adaptogens, protein powders as supplements, nootropics, herbal extracts
beauty — skincare, cosmetics, haircare, makeup, fragrance, personal care (non-nutritional)
pets — pet food, pet treats, pet supplements, pet accessories, pet health products
fitness — sports equipment, gym accessories, sportswear, athletic gear, sports nutrition (pre/post-workout), fitness tools
home — kitchen gadgets, home organization, cleaning products, home decor, candles, small appliances, lifestyle goods

Output ONLY the category ID — no explanation, no other words. Choose the single most relevant category.`

async function classifyWithLLM(input: string): Promise<KnownCategoryId> {
  const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const msg = await ai.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 10,
      system:     CLASSIFY_SYSTEM,
      messages:   [{ role: 'user', content: input.trim() }],
    })
    const raw = (msg.content[0].type === 'text' ? msg.content[0].text : '').trim().toLowerCase()
    if ((VALID_CATEGORY_IDS as readonly string[]).includes(raw)) {
      return raw as KnownCategoryId
    }
  } catch {
    // Fall through to default
  }
  // Default: supplements (our primary category)
  return 'supplements'
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function classifyQuery(input: string): Promise<string> {
  const scores = scoreByKeywords(input)
  const keywordResult = pickBestKeywordMatch(scores)

  if (keywordResult) {
    return keywordResult
  }

  // Ambiguous — use LLM for accurate classification
  return classifyWithLLM(input)
}

// Synchronous keyword-only classifier — for cases where we can't await.
// Returns null when ambiguous (caller should fall back to 'supplements').
export function classifyQuerySync(input: string): string | null {
  return pickBestKeywordMatch(scoreByKeywords(input))
}
