// ── Client-safe category config ────────────────────────────────────────────
//
// Contains no server-only imports — safe to use in client components.
// Each entry mirrors the client-relevant subset of CategoryModule.
// When a new category module is added server-side, add a matching entry here.

export interface CategoryClientConfig {
  readonly id:       string
  readonly name:     string
  readonly slug:     string
  readonly tagline:  string
  readonly icon:     string
  readonly examples: {
    broad:    string[]
    specific: string[]
  }
  isBroadQuery(input: string): boolean
}

// ── Supplements ────────────────────────────────────────────────────────────

const SPECIFIC_INGREDIENTS_SUP = new Set([
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
  if (words.some(w => SPECIFIC_INGREDIENTS_SUP.has(w)))                      return false
  return words.length <= 4
}

// ── Registry ───────────────────────────────────────────────────────────────
// Add future category entries here when new server-side modules are registered.

export const CATEGORY_CLIENT_CONFIGS: CategoryClientConfig[] = [
  {
    id:      'supplements',
    name:    'Supplements',
    slug:    'supplements',
    tagline: 'Know if your supplement idea is worth building.',
    icon:    '◎',
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
]

export const DEFAULT_CATEGORY_ID = 'supplements'

export function getCategoryClientConfig(id: string): CategoryClientConfig {
  return (
    CATEGORY_CLIENT_CONFIGS.find(c => c.id === id) ??
    CATEGORY_CLIENT_CONFIGS[0]
  )
}
