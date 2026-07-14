// Clustering tests — Roadmap M2.7.
//
// The key test here is the roadmap's own acceptance criterion, verbatim:
// "at least one cluster matches a known VOC finding (validation anchor)."
// voc_problem_clusters.md (this project's own prior manual VOC research)
// ranks "The Perimenopause Collapse" as its #1 cluster (Market Opportunity
// Score 9.5/10) — a fixture corpus modeled on realistic Reddit language for
// that exact theme, mixed with unrelated noise posts, must cluster and rank
// it correctly. This proves the pipeline's deterministic keyword-clustering
// actually surfaces a real, already-validated consumer problem theme, not
// just whatever it happens to be fed.

import { describe, it, expect } from 'vitest'
import { clusterPosts, rankClusters } from '../clustering'
import { PROBLEM_TOPICS } from '../topics'
import type { VocPost } from '../clustering'

function post(overrides: Partial<VocPost> = {}): VocPost {
  return {
    title: 'Untitled', score: 10, num_comments: 2, created_utc: Date.now() / 1000,
    subreddit: 'test', ...overrides,
  }
}

describe('clusterPosts — VOC validation anchor', () => {
  it('surfaces the Perimenopause Collapse cluster (voc_problem_clusters.md\'s #1 ranked finding) as the top-ranked cluster from realistic mixed real-shaped input', () => {
    const perimenopausePosts: VocPost[] = [
      post({ title: 'Brain fog so bad during perimenopause I forgot my own phone number', score: 340, num_comments: 88, subreddit: 'Menopause' }),
      post({ title: 'Anyone else gaining weight for no reason in perimenopause?', body: 'I eat perfectly, sleep, exercise, and still feel like I\'m walking through mud.', score: 210, num_comments: 60, subreddit: 'PerimenopauseRage' }),
      post({ title: 'Hot flashes and mood swings are ruining my life', score: 150, num_comments: 40, subreddit: 'Menopause' }),
      post({ title: 'Hormonal weight gain at 44, nothing works', score: 95, num_comments: 30, subreddit: 'PerimenopauseRage' }),
      post({ title: 'Brain fog is real, my doctor says my labs are normal', score: 80, num_comments: 25, subreddit: 'Menopause' }),
    ]
    const noisePosts: VocPost[] = [
      post({ title: 'Check out my new home gym setup!', score: 500, num_comments: 5, subreddit: 'Fitness' }),
      post({ title: 'What supplements do you take daily?', score: 20, num_comments: 3, subreddit: 'Supplements' }),
      post({ title: 'My cat is adorable today', score: 900, num_comments: 2, subreddit: 'cats' }),
    ]

    const stats = clusterPosts([...perimenopausePosts, ...noisePosts], PROBLEM_TOPICS)
    const ranked = rankClusters(stats)

    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked[0].topic_key).toBe('perimenopause_hormonal')
    expect(ranked[0].post_count).toBe(perimenopausePosts.length)
    expect(ranked[0].subreddits_seen).toEqual(['Menopause', 'PerimenopauseRage'])
    expect(ranked[0].sample_quotes.length).toBeGreaterThan(0)
    expect(ranked[0].sample_quotes[0]).toContain('Brain fog')
  })

  it('a post can belong to more than one topic when its real language genuinely spans clusters', () => {
    const guSkinAndStress = post({ title: 'My gut health issues and cortisol stress are both making my rosacea worse', score: 50, num_comments: 10 })
    const stats = clusterPosts([guSkinAndStress], PROBLEM_TOPICS)
    const keys = stats.map(s => s.topic_key)
    expect(keys).toContain('gut_skin_inflammation')
    expect(keys).toContain('cortisol_sleep')
  })

  it('never includes a topic with zero real matches (no fabricated zero-count row)', () => {
    const onlyPerimenopause = [post({ title: 'perimenopause brain fog again' })]
    const stats = clusterPosts(onlyPerimenopause, PROBLEM_TOPICS)
    expect(stats.every(s => s.topic_key === 'perimenopause_hormonal')).toBe(true)
    expect(stats.length).toBe(1)
  })

  it('computes real avg engagement from score + 2x comments across matched posts only', () => {
    const posts = [
      post({ title: 'creatine plateau recovery gap', score: 10, num_comments: 5 }),   // engagement 20
      post({ title: 'hit a plateau with creatine again', score: 30, num_comments: 15 }), // engagement 60
    ]
    const stats = clusterPosts(posts, PROBLEM_TOPICS)
    const fitness = stats.find(s => s.topic_key === 'fitness_plateau_recovery')
    expect(fitness?.avg_engagement_score).toBeCloseTo((20 + 60) / 2, 5)
  })

  it('Roadmap M2.13 — a DataForSEO-sourced post (score 0, no invented engagement) never outranks a real-engagement post in sample_quotes', () => {
    const realComment = post({ title: 'Real human quote', body: 'creatine plateau finally broke after adding recovery days', score: 12, num_comments: 4, subreddit: 'youtube:abc123' })
    const dataForSeoPost = post({ title: 'creatine plateau recovery gap', score: 0, num_comments: 0, subreddit: 'dataforseo-question-keywords' })

    const stats = clusterPosts([dataForSeoPost, realComment], PROBLEM_TOPICS)
    const fitness = stats.find(s => s.topic_key === 'fitness_plateau_recovery')
    expect(fitness?.post_count).toBe(2)
    // Real comment (engagement 12 + 4*2 = 20) must sort ahead of the
    // DataForSEO post (engagement 0) in sample_quotes.
    expect(fitness?.sample_quotes[0]).toContain('Real human quote')
  })
})

describe('rankClusters', () => {
  it('sorts by real post_count descending, ties broken alphabetically by topic_key for reproducibility', () => {
    const stats = [
      { topic_key: 'zeta', topic_label: 'Zeta', post_count: 5, avg_engagement_score: 1, sample_quotes: [], subreddits_seen: [] },
      { topic_key: 'alpha', topic_label: 'Alpha', post_count: 5, avg_engagement_score: 1, sample_quotes: [], subreddits_seen: [] },
      { topic_key: 'beta', topic_label: 'Beta', post_count: 10, avg_engagement_score: 1, sample_quotes: [], subreddits_seen: [] },
    ]
    const ranked = rankClusters(stats)
    expect(ranked.map(r => r.topic_key)).toEqual(['beta', 'alpha', 'zeta'])
  })
})
