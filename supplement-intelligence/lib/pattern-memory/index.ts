// ── BUILD_NOW Pattern Memory — public API ─────────────────────────────────────
//
// ARCHITECTURE CONSTRAINT: this module is NEVER imported by lib/scoring.ts.
// The Decision Engine remains fully independent. Pattern memory is append-only
// at generation time and read-only for analytics — it has zero influence on
// scoring decisions.
//
// Usage:
//   writeBuildNowPattern(sb, memo, grounded, memoId, userId)  ← in route.ts
//   queryBuildNowPatterns(sb, { limit, tags })                ← for analytics
//   compareToBuildNowPatterns(sb, grounded)                   ← future use

import type { SupabaseClient }    from '@supabase/supabase-js'
import type { MemoData }          from '@/types/index'
import type { GroundedScore }     from '@/lib/scoring'
import { extractBuildNowPattern } from './extract'
import type { BuildNowPattern }   from './types'

export type { BuildNowPattern, OpportunityPattern } from './types'

// ── Write ─────────────────────────────────────────────────────────────────────

// Called exactly once per BUILD_NOW memo, after the analysis is saved.
// Never throws — failure is logged and swallowed so it never blocks delivery.
export async function writeBuildNowPattern(
  sb: SupabaseClient,
  memo: MemoData,
  grounded: GroundedScore,
  memoId: string,
  userId: string,
): Promise<void> {
  try {
    const pattern = extractBuildNowPattern(memo, grounded, memoId, userId)
    const { error } = await sb.from('build_now_patterns').insert({
      memo_id:               pattern.memo_id,
      user_id:               pattern.user_id,
      product_name:          pattern.product_name,
      product_query:         pattern.product_query,
      category:              pattern.category,
      scoring_engine_version: pattern.scoring_engine_version,

      opportunity_score:   pattern.opportunity_score,
      verdict:             pattern.verdict,
      verdict_confidence:  pattern.verdict_confidence,

      monthly_search_volume:   pattern.monthly_search_volume,
      top_keyword:             pattern.top_keyword,
      search_growth_pct:       pattern.search_growth_pct,
      google_trends_direction: pattern.google_trends_direction,

      tiktok_view_count: pattern.tiktok_view_count,
      tiktok_signal:     pattern.tiktok_signal,

      review_concentration:   pattern.review_concentration,
      competitor_count:       pattern.competitor_count,
      avg_competitor_reviews: pattern.avg_competitor_reviews,
      price_range_low:        pattern.price_range_low,
      price_range_high:       pattern.price_range_high,

      gross_margin_pct:   pattern.gross_margin_pct,
      cac_pressure_score: pattern.cac_pressure_score,
      fee_burden_score:   pattern.fee_burden_score,

      consumer_pain_score:      pattern.consumer_pain_score,
      consumer_review_count:    pattern.consumer_review_count,
      consumer_negative_pct:    pattern.consumer_negative_pct,
      consumer_theme_count:     pattern.consumer_theme_count,
      repurchase_language_rate: pattern.repurchase_language_rate,

      manufacturing_feasibility_score: pattern.manufacturing_feasibility_score,
      unit_cost_low:  pattern.unit_cost_low,
      unit_cost_high: pattern.unit_cost_high,

      safety_gate_clean:       pattern.safety_gate_clean,
      fda_recall_count:        pattern.fda_recall_count,
      fda_adverse_event_count: pattern.fda_adverse_event_count,

      score_demand:               pattern.score_demand,
      score_market_accessibility: pattern.score_market_accessibility,
      score_profitability:        pattern.score_profitability,
      score_consumer_pain:        pattern.score_consumer_pain,
      score_virality:             pattern.score_virality,
      score_subscription:         pattern.score_subscription,
      score_manufacturing:        pattern.score_manufacturing,

      evidence_breadth_pct:   pattern.evidence_breadth_pct,
      contributing_providers: pattern.contributing_providers,

      opportunity_pattern: pattern.opportunity_pattern,
    })
    if (error) {
      console.error('Pattern memory write failed', { memoId, error: error.message })
    } else {
      console.log('Pattern memory recorded', {
        memoId,
        score:        pattern.opportunity_score,
        market_stage: pattern.opportunity_pattern.market_stage,
        entry_type:   pattern.opportunity_pattern.entry_type,
        tags:         pattern.opportunity_pattern.pattern_tags,
      })
    }
  } catch (e) {
    console.error('Pattern memory extraction failed', {
      memoId,
      error: e instanceof Error ? e.message : e,
    })
  }
}

// ── Query (analytics) ─────────────────────────────────────────────────────────

export interface PatternQueryOptions {
  limit?:      number
  tags?:       string[]      // filter by any of these pattern_tags
  minScore?:   number        // filter by opportunity_score ≥ N
  userId?:     string        // restrict to a single user (omit for cross-user via service role)
}

export async function queryBuildNowPatterns(
  sb: SupabaseClient,
  opts: PatternQueryOptions = {},
): Promise<BuildNowPattern[]> {
  let q = sb
    .from('build_now_patterns')
    .select('*')
    .order('opportunity_score', { ascending: false })
    .limit(opts.limit ?? 50)

  if (opts.userId)   q = q.eq('user_id', opts.userId)
  if (opts.minScore) q = q.gte('opportunity_score', opts.minScore)
  // Tag filtering: any row whose pattern_tags JSONB array contains any of the requested tags.
  // Uses Postgres ?| (array overlap on JSONB) via the filter helper.
  if (opts.tags?.length) {
    q = q.contains('opportunity_pattern->pattern_tags', opts.tags)
  }

  const { data, error } = await q
  if (error) {
    console.error('Pattern memory query failed', error.message)
    return []
  }
  return (data ?? []) as BuildNowPattern[]
}

// ── Common pattern summary (analytics helper) ─────────────────────────────────
// Aggregates a set of patterns into a frequency map of tags and dimensions —
// useful for discovering what characteristics appear most often in BUILD_NOW approvals.

export interface PatternSummary {
  total:          number
  tag_frequency:  Record<string, number>
  avg_score:      number
  market_stages:  Record<string, number>
  entry_types:    Record<string, number>
  avg_dimensions: Record<string, number | null>
}

export function summarizePatterns(patterns: BuildNowPattern[]): PatternSummary {
  if (!patterns.length) {
    return { total: 0, tag_frequency: {}, avg_score: 0, market_stages: {}, entry_types: {}, avg_dimensions: {} }
  }

  const tagFreq:    Record<string, number> = {}
  const stages:     Record<string, number> = {}
  const entryTypes: Record<string, number> = {}
  const dimSums:    Record<string, number[]> = {}

  for (const p of patterns) {
    const op = p.opportunity_pattern
    for (const tag of op.pattern_tags)  tagFreq[tag]    = (tagFreq[tag]    ?? 0) + 1
    stages[op.market_stage]    = (stages[op.market_stage]    ?? 0) + 1
    entryTypes[op.entry_type]  = (entryTypes[op.entry_type]  ?? 0) + 1

    const dims: Record<string, number | null> = {
      demand:               p.score_demand,
      market_accessibility: p.score_market_accessibility,
      profitability:        p.score_profitability,
      consumer_pain:        p.score_consumer_pain,
      virality:             p.score_virality,
      subscription:         p.score_subscription,
      manufacturing:        p.score_manufacturing,
    }
    for (const [k, v] of Object.entries(dims)) {
      if (typeof v === 'number') {
        if (!dimSums[k]) dimSums[k] = []
        dimSums[k].push(v)
      }
    }
  }

  const avgDims: Record<string, number | null> = {}
  for (const [k, vals] of Object.entries(dimSums)) {
    avgDims[k] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
  }

  return {
    total:         patterns.length,
    tag_frequency: tagFreq,
    avg_score:     Math.round(patterns.reduce((s, p) => s + p.opportunity_score, 0) / patterns.length),
    market_stages: stages,
    entry_types:   entryTypes,
    avg_dimensions: avgDims,
  }
}
