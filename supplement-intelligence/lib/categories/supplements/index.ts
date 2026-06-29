import {
  DISCOVERY_PROMPT,
  buildRefreshPrompt,
  buildSignalAugmentedSystemPrompt,
} from '@/lib/prompts/discovery'
import { SYSTEM_PROMPT } from '@/lib/prompts/system'
import { matchesToken, confirmRelevanceWithLLM } from '../relevance-matching'
import type { CategoryModule } from '../types'

// ── Broad-vs-specific detection ────────────────────────────────────────────
// Broad: ≤4 words, no qualifiers (numbers, "for/with", specific populations,
// named ingredients). Determines whether the user enters discovery mode.

const SPECIFIC_INGREDIENTS = new Set([
  'ashwagandha','magnesium','melatonin','creatine','inositol','berberine',
  'maca','collagen','vitamin','zinc','iron','glycine','taurine','biotin',
  'rhodiola','ginseng','turmeric','curcumin','coq10','nad','d3','b12',
])

function isBroadQuery(input: string): boolean {
  const t = input.trim().toLowerCase()
  if (/\bfor\b|\bwith\b/.test(t))                                           return false
  if (/\d/.test(t))                                                           return false
  if (/\b(athlete|postpartum|pregnant|vegan|keto|pcos|adhd)\b/.test(t))     return false
  const words = t.split(/\s+/)
  if (words.some(w => SPECIFIC_INGREDIENTS.has(w)))                          return false
  return words.length <= 4
}

// ── Supplement relevance gate ──────────────────────────────────────────────
// Conservative: err on the side of passing ambiguous inputs to Claude.
// This gate is bypassed for discovery-originated inputs (fromDiscovery=true).

const SUPPLEMENT_TOKENS = new Set([
  // supplement / nutrition terms
  'supplement','supplements','vitamin','vitamins','mineral','minerals',
  'protein','collagen','probiotic','probiotics','prebiotic','prebiotics',
  'omega','fiber','fibre','amino','herb','herbal','botanical','extract',
  'adaptogen','nootropic','peptide','nutraceutical','superfood',
  'capsule','capsules','gummy','gummies','powder','tincture','softgel',
  // health conditions and symptoms
  'sleep','stress','anxiety','energy','fatigue','tired','tiredness',
  'muscle','gut','digestion','digestive','bloat','bloating',
  'immune','immunity','hormone','hormones','hormonal','cortisol',
  'hair','skin','nail','nails','mood','focus','memory','cognitive','brain',
  'libido','fertility','menopause','perimenopause','pcos','acne',
  'joint','joints','pain','inflammation','inflammatory','metabolism','metabolic',
  'insulin','thyroid','adrenal','detox','cleanse','appetite',
  'weight loss','fat loss','fat burning','muscle gain','muscle growth',
  // specific ingredients
  'magnesium','zinc','iron','calcium','potassium','ashwagandha','turmeric',
  'curcumin','melatonin','creatine','glutamine','maca','rhodiola','ginseng',
  'mushroom','mushrooms','berberine','inositol','glycine','taurine','carnitine',
  'biotin','folate','b12','d3','coq10','nad','colostrum','elderberry',
  'echinacea','spirulina','chlorella','reishi','lion\'s mane','ashwa',
  // wellness goals and contexts
  'recovery','endurance','strength','antioxidant','longevity','wellness',
  'health','healthy','nutrition','nutritional','dietary','diet',
  'postpartum','prenatal','pregnancy','breastfeeding','fasting','fast',
  // body systems used in supplement context
  'liver','heart','bone','cartilage','blood','blood sugar',
])

async function isRelevantQuery(raw: string): Promise<boolean> {
  const lower = raw.toLowerCase()
  const words = lower.split(/\W+/).filter(Boolean)
  for (const w of words) {
    if (matchesToken(w, SUPPLEMENT_TOKENS)) return true
  }
  for (let i = 0; i < words.length - 1; i++) {
    if (SUPPLEMENT_TOKENS.has(`${words[i]} ${words[i + 1]}`)) return true
  }
  return confirmRelevanceWithLLM(raw, 'supplements')
}

// ── Supplements module ─────────────────────────────────────────────────────

export const supplementsModule: CategoryModule = {
  id:          'supplements',
  name:        'Supplements',
  slug:        'supplements',
  tagline:     'Know if your supplement idea is worth building.',
  description: '5-dimension market analysis for supplement brand opportunities.',
  icon:        '◎',

  discoverySystemPrompt: DISCOVERY_PROMPT,
  buildRefreshPrompt,
  buildSignalAugmentedPrompt: buildSignalAugmentedSystemPrompt,

  analysisSystemPrompt: SYSTEM_PROMPT,
  isRelevantQuery,

  isBroadQuery,

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
}
