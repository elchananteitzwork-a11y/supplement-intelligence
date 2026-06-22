// ── Client-safe category config ────────────────────────────────────────────
//
// No server-only imports — safe for client components.
// When a new server-side CategoryModule is added, add a matching entry here.
// The 'auto' entry represents Open Discovery (automatic category detection).

export interface CategoryClientConfig {
  readonly id:       string
  readonly name:     string
  readonly slug:     string
  readonly tagline:  string
  readonly icon:     string
  readonly isAuto:   boolean  // true only for Open Discovery
  readonly examples: {
    broad:    string[]
    specific: string[]
  }
  isBroadQuery(input: string): boolean
}

// ── Supplements ────────────────────────────────────────────────────────────

const SUP_INGREDIENTS = new Set([
  'ashwagandha','magnesium','melatonin','creatine','inositol','berberine',
  'maca','collagen','vitamin','zinc','iron','glycine','taurine','biotin',
  'rhodiola','ginseng','turmeric','curcumin','coq10','nad','d3','b12',
])

function isBroadSupplements(input: string): boolean {
  const t = input.trim().toLowerCase()
  if (/\bfor\b|\bwith\b/.test(t))                                           return false
  if (/\d/.test(t))                                                           return false
  if (/\b(athlete|postpartum|pregnant|vegan|keto|pcos|adhd)\b/.test(t))     return false
  const words = t.split(/\s+/)
  if (words.some(w => SUP_INGREDIENTS.has(w)))                               return false
  return words.length <= 4
}

// ── Beauty & Skincare ──────────────────────────────────────────────────────

const BEAUTY_ACTIVES = new Set([
  'retinol','niacinamide','vitamin c','glycolic','hyaluronic',
  'salicylic','ceramide','peptide','bakuchiol','squalane',
])

function isBroadBeauty(input: string): boolean {
  const t = input.trim().toLowerCase()
  if (/\bfor\b|\bwith\b|\bto\b/.test(t))                                    return false
  if (/\d/.test(t))                                                           return false
  if (/\b(oily|dry|sensitive|combination|mature|aging|acne-prone)\b/.test(t)) return false
  const words = t.split(/\s+/)
  if (words.some(w => BEAUTY_ACTIVES.has(w)))                                return false
  return words.length <= 3
}

// ── Pet Products ───────────────────────────────────────────────────────────

function isBroadPets(input: string): boolean {
  const t = input.trim().toLowerCase()
  if (/\bfor\b|\bwith\b/.test(t))                                            return false
  if (/\d/.test(t))                                                           return false
  if (/\b(senior|puppy|kitten|small|large|giant|breed)\b/.test(t))          return false
  return t.split(/\s+/).length <= 3
}

// ── Fitness & Sports ───────────────────────────────────────────────────────

const FITNESS_TERMS = new Set([
  'creatine','bcaa','citrulline','beta-alanine','whey','casein',
  'kettlebell','dumbbell','barbell',
])

function isBroadFitness(input: string): boolean {
  const t = input.trim().toLowerCase()
  if (/\bfor\b|\bwith\b/.test(t))                                           return false
  if (/\d/.test(t))                                                           return false
  if (/\b(beginner|advanced|women|men|runner|lifter|athlete)\b/.test(t))    return false
  const words = t.split(/\s+/)
  if (words.some(w => FITNESS_TERMS.has(w)))                                  return false
  return words.length <= 3
}

// ── Home & Lifestyle ───────────────────────────────────────────────────────

function isBroadHome(input: string): boolean {
  const t = input.trim().toLowerCase()
  if (/\bfor\b|\bwith\b/.test(t))                                            return false
  if (/\d/.test(t))                                                           return false
  if (/\b(eco|sustainable|smart|electric|wireless|rechargeable)\b/.test(t))  return false
  return t.split(/\s+/).length <= 3
}

// ── Open Discovery ─────────────────────────────────────────────────────────
// Always treated as broad so discovery pipeline is always invoked.

function isBroadAuto(_input: string): boolean {
  return true
}

// ── Registry ───────────────────────────────────────────────────────────────

export const CATEGORY_CLIENT_CONFIGS: CategoryClientConfig[] = [
  {
    id:      'auto',
    name:    'Open Discovery',
    slug:    'auto',
    tagline: 'Type anything — AI detects the right category automatically.',
    icon:    '⚡',
    isAuto:  true,
    examples: {
      broad: [
        'Sleep supplement', 'Viral kitchen gadget', 'Dog joint product',
        'Anti-aging serum', 'Gym recovery', 'Cat anxiety',
      ],
      specific: [],
    },
    isBroadQuery: isBroadAuto,
  },
  {
    id:      'supplements',
    name:    'Supplements',
    slug:    'supplements',
    tagline: 'Know if your supplement idea is worth building.',
    icon:    '◎',
    isAuto:  false,
    examples: {
      broad: [
        'Gut Health', 'Sleep', "Women's Health",
        'Weight Loss', 'Hair Loss', 'Energy', 'Hydration', 'Longevity',
      ],
      specific: [
        'Cortisol support for women 35+',
        'PCOS weight loss supplement',
        'Postpartum recovery supplement',
      ],
    },
    isBroadQuery: isBroadSupplements,
  },
  {
    id:      'beauty',
    name:    'Beauty & Skincare',
    slug:    'beauty',
    tagline: 'Know if your beauty brand idea is worth building.',
    icon:    '✦',
    isAuto:  false,
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
    isBroadQuery: isBroadBeauty,
  },
  {
    id:      'pets',
    name:    'Pet Products',
    slug:    'pets',
    tagline: 'Know if your pet brand idea is worth building.',
    icon:    '◈',
    isAuto:  false,
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
    isBroadQuery: isBroadPets,
  },
  {
    id:      'fitness',
    name:    'Fitness & Sports',
    slug:    'fitness',
    tagline: 'Know if your fitness brand idea is worth building.',
    icon:    '⬡',
    isAuto:  false,
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
    isBroadQuery: isBroadFitness,
  },
  {
    id:      'home',
    name:    'Home & Lifestyle',
    slug:    'home',
    tagline: 'Know if your home product idea is worth building.',
    icon:    '⬟',
    isAuto:  false,
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
    isBroadQuery: isBroadHome,
  },
]

export const DEFAULT_CATEGORY_ID = 'auto'

export function getCategoryClientConfig(id: string): CategoryClientConfig {
  return (
    CATEGORY_CLIENT_CONFIGS.find(c => c.id === id) ??
    CATEGORY_CLIENT_CONFIGS[0]   // falls back to Open Discovery
  )
}
