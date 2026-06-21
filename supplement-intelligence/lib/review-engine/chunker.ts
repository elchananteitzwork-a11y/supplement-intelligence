import type { RawReview, RatingDistribution, ReviewEngineConfig } from './types'

// ── Public types ───────────────────────────────────────────────────────────

export interface ReviewChunk {
  index:       number
  reviews:     RawReview[]
  avg_rating:  number
  rating_dist: RatingDistribution
}

export interface ChunkPlan {
  chunks:          ReviewChunk[]
  sampling_used:   boolean
  analyzed_count:  number   // reviews actually going into chunks after sampling
}

// ── Public entry point ─────────────────────────────────────────────────────

export function chunkReviews(
  reviews: RawReview[],
  config:  ReviewEngineConfig,
): ChunkPlan {
  // 1. Discard reviews too short to carry signal
  const valid = reviews.filter(r =>
    typeof r.body === 'string' && r.body.trim().length >= config.min_body_length
  )

  // 2. Sample if the corpus is larger than what fits in max_chunks × reviews_per_chunk
  const budget       = config.max_chunks * config.reviews_per_chunk
  let toAnalyze:     RawReview[]
  let sampling_used: boolean

  if (valid.length > budget) {
    sampling_used = true
    toAnalyze     = config.sampling_strategy === 'stratified'
      ? stratifiedSample(valid, budget)
      : randomSample(valid, budget)
  } else {
    sampling_used = false
    toAnalyze     = valid
  }

  // 3. Split into fixed-size chunks
  const chunks: ReviewChunk[] = []
  for (let i = 0; i < toAnalyze.length; i += config.reviews_per_chunk) {
    const slice = toAnalyze.slice(i, i + config.reviews_per_chunk)
    chunks.push({
      index:       chunks.length,
      reviews:     slice,
      avg_rating:  computeAvgRating(slice),
      rating_dist: computeRatingDist(slice),
    })
  }

  return { chunks, sampling_used, analyzed_count: toAnalyze.length }
}

// ── Sampling strategies ────────────────────────────────────────────────────

// Stratified: preserve the natural 1★–5★ distribution so negative reviews
// (rare but high-signal) are not crowded out by 4★–5★ volume.
function stratifiedSample(reviews: RawReview[], target: number): RawReview[] {
  const buckets: Record<number, RawReview[]> = { 1:[], 2:[], 3:[], 4:[], 5:[] }
  for (const r of reviews) {
    const star = clampStar(r.rating)
    buckets[star].push(r)
  }

  const sampled: RawReview[] = []
  for (let star = 1; star <= 5; star++) {
    const group = buckets[star]
    if (!group.length) continue
    const proportion = group.length / reviews.length
    const quota      = Math.max(1, Math.round(proportion * target))
    sampled.push(...shuffle([...group]).slice(0, quota))
  }

  // Rounding may push us slightly over or under; trim or top-up with random draws
  const trimmed = shuffle(sampled).slice(0, target)
  if (trimmed.length < target) {
    const remaining = reviews.filter(r => !trimmed.includes(r))
    trimmed.push(...shuffle(remaining).slice(0, target - trimmed.length))
  }
  return trimmed
}

function randomSample(reviews: RawReview[], target: number): RawReview[] {
  return shuffle([...reviews]).slice(0, target)
}

// ── Helpers ────────────────────────────────────────────────────────────────

function computeAvgRating(reviews: RawReview[]): number {
  if (!reviews.length) return 0
  const sum = reviews.reduce((s, r) => s + r.rating, 0)
  return Math.round((sum / reviews.length) * 10) / 10
}

function computeRatingDist(reviews: RawReview[]): RatingDistribution {
  const dist: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of reviews) {
    dist[clampStar(r.rating)]++
  }
  return dist
}

function clampStar(rating: number): 1 | 2 | 3 | 4 | 5 {
  return Math.min(5, Math.max(1, Math.round(rating))) as 1 | 2 | 3 | 4 | 5
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
