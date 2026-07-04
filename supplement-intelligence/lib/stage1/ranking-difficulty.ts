// ── Amazon Ranking Difficulty ─────────────────────────────────────────────
// Pure deterministic computation over real top_competitors review data
// (Apify Amazon search results). No AI involvement, no invented numbers.

export type DifficultyLevel = 'Low' | 'Medium' | 'High' | 'Extreme'

export interface RankingDifficulty {
  median_reviews_top5:  number          // median review count of top-5 competitors
  avg_reviews_top10:    number          // average review count of top-10
  reviews_to_compete:   number          // ~70% of median top-5 (credibility threshold)
  page1_difficulty:     DifficultyLevel
  is_review_protected:  boolean         // true when median top-5 ≥ 1,000 reviews
  competitor_count:     number          // sample size
  sample_note:          string
  assumptions:          string[]
}

function sortedNums(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b)
}

function median(nums: number[]): number {
  const s = sortedNums(nums)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1]! + s[mid]!) / 2
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function computeRankingDifficulty(
  competitors: Array<{ reviewCount: number; brand: string; position?: number }>
): RankingDifficulty | null {
  if (!competitors.length) return null

  // Sort by organic search position ascending — page-1 incumbents by real rank
  const byPosition = [...competitors].sort((a, b) => {
    const pa = (a as typeof a & { position?: number }).position ?? 999
    const pb = (b as typeof b & { position?: number }).position ?? 999
    return pa - pb
  })

  const top5  = byPosition.slice(0, 5).map(c => c.reviewCount)
  const top10 = byPosition.slice(0, 10).map(c => c.reviewCount)

  const median5 = median(top5)
  const avg10   = avg(top10)

  // A new entrant needs ~70% of the median top-5 review count to appear
  // credible alongside established competitors; floor at 50 (Amazon's visibility
  // threshold below which a product rarely surfaces organically).
  const reviewsToCompete = Math.max(50, Math.round(median5 * 0.70))

  const page1_difficulty: DifficultyLevel =
    median5 < 100  ? 'Low' :
    median5 < 500  ? 'Medium' :
    median5 < 2000 ? 'High'   : 'Extreme'

  return {
    median_reviews_top5:  Math.round(median5),
    avg_reviews_top10:    Math.round(avg10),
    reviews_to_compete:   reviewsToCompete,
    page1_difficulty,
    is_review_protected:  median5 >= 1000,
    competitor_count:     competitors.length,
    sample_note: `${Math.min(competitors.length, 10)} Amazon organic results (Apify junglee crawler)`,
    assumptions: [
      'Reviews to compete ≈ 70% of median top-5 review count (credibility threshold for page-1 appearance)',
      'Difficulty thresholds: Low <100, Medium 100–499, High 500–1,999, Extreme ≥2,000 (median top-5)',
      'Sample may include sponsored placements — no ad flag available from Apify junglee actor',
      'Review counts are real real-time scrape values; not from Amazon Ads or Keepa',
    ],
  }
}
