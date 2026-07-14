// ── Relative-interest query broadening — shared by Trends-style providers ───
//
// Roadmap M2.14: extracted, unchanged, from google-trends.ts (AUDIT FIX
// 2026-07-01) so lib/signal-engine/providers/dataforseo-trends.ts can reuse
// the exact same broadening strategy rather than duplicating it — both
// providers face the identical real problem: a SKU-level query ("Collagen
// Peptide Gummies for Skin") returns too little relative-interest data,
// because these APIs work at the ingredient/benefit level, not the SKU
// level. google-trends.ts now imports this instead of defining it locally;
// its own behavior is unchanged.

export function toSearchKeyword(category: string): string {
  return category
    .toLowerCase()
    .replace(/\bsupplements?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const PREP_WORDS = new Set(['for', 'with', 'of', 'to', 'and', 'plus', 'by'])
const STOP_WORDS = new Set(['supplement', 'supplements', 'support', 'relief', 'formula',
  'complex', 'blend', 'mix', 'care', 'health', 'boost', 'aid'])

// Broadening strategy (same principle DataForSEO's own keyword provider
// already uses):
//   1. Exact query with "supplement(s)" stripped
//   2. Strip "for/with/of X" clause at end
//   3. Keep only the first 2 meaningful words
//   4. Keep only the first meaningful word (key ingredient)
export function broadenTrendsQuery(original: string): string[] {
  const base = toSearchKeyword(original)
  if (!base) return []

  const candidates: string[] = [base]
  const words = base.split(/\s+/).filter(Boolean)

  const prepIdx = words.findIndex(w => PREP_WORDS.has(w))
  if (prepIdx > 0) {
    candidates.push(words.slice(0, prepIdx).join(' '))
  }

  const meaningful = words.filter(w => !PREP_WORDS.has(w) && !STOP_WORDS.has(w))
  if (meaningful.length >= 2) {
    candidates.push(meaningful.slice(0, 2).join(' '))
  }
  if (meaningful.length >= 1 && meaningful[0].length >= 4) {
    candidates.push(meaningful[0])
  }

  const seen = new Set<string>()
  return candidates.filter(c => c.length >= 3 && !seen.has(c) && seen.add(c) !== undefined)
}
