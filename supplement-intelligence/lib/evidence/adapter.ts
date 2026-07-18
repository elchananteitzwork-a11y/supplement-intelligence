import { EvidencePoint, toEvidencePoint } from './types'
import { AggregatedSignals, AggregatedDimension, SignalScore } from '../signal-engine/types'
import type { RankingDifficulty } from '../stage1/ranking-difficulty'
import type { PpcEconomics } from '../stage1/ppc-economics'
import type { RegulatoryIntelligence } from '../regulatory-engine/types'

// ── Signal-level evidence points ──────────────────────────────────────────────
// Each field on AggregatedSignals has a different provenance. This mapping
// table captures the source_type for the key numeric outputs that feed the
// data quality gate and kill switches.

export interface Stage1Evidence {
  // Demand signals
  monthly_search_volume?: EvidencePoint<number>
  trend_direction?:       EvidencePoint<string>
  top_regions?:           EvidencePoint<string[]>

  // Competition signals
  competitor_count?:      EvidencePoint<number>
  review_concentration?:  EvidencePoint<number>
  avg_competitor_reviews?: EvidencePoint<number>

  // Revenue signals
  median_price?:           EvidencePoint<number>
  price_range?:            EvidencePoint<{ min: number; max: number }>
  avg_fba_fee?:            EvidencePoint<number>
  avg_referral_fee_pct?:   EvidencePoint<number>
  est_monthly_revenue?:    EvidencePoint<number>
  top_seller_revenue?:     EvidencePoint<number>   // top performer's monthly revenue (Keepa)
  est_monthly_units_sold?: EvidencePoint<number>   // avg monthly units across top sellers (Keepa)
  avg_market_rating?:      EvidencePoint<number>   // avg star rating from Keepa bestsellers

  // Growth signals
  momentum_90d_pct?:      EvidencePoint<number>
  yoy_change?:            EvidencePoint<string>

  // Seasonality signals
  seasonality_pattern?:   EvidencePoint<string>
  peak_months?:           EvidencePoint<string[]>

  // Virality signals
  tiktok_video_count?:    EvidencePoint<number>
  tiktok_view_count?:     EvidencePoint<number>

  // Price compression (extended Keepa signal — 12-month proxy)
  price_compression_pct?: EvidencePoint<number>
  price_avg_90d?:         EvidencePoint<number>
  price_avg_365d?:        EvidencePoint<number>

  // Amazon ranking difficulty (computed from top_competitors review counts)
  ranking_difficulty?: EvidencePoint<RankingDifficulty>

  // PPC economics estimate (derived from DataForSEO CPC + market price)
  ppc_economics?: EvidencePoint<PpcEconomics>

  // OpenFDA regulatory intelligence (CAERS adverse events + enforcement recalls)
  regulatory_intelligence?: EvidencePoint<RegulatoryIntelligence>

  // Top competitors list (reused by Stage 2 thesis generator)
  top_competitors?: EvidencePoint<Array<{
    productId: string
    brand: string
    reviewCount: number
    rating: number
    price: number
    position?: number
    breadcrumb?: string
    bullets?: string[]
    ingredients_label?: string
    // M2.19: real matched DSHEA disease-claim-language phrases from this
    // listing's own bullets/ingredients_label, per
    // lib/regulatory-engine/claim-risk.ts's deterministic scanner.
    // Purely additive — undefined means "not scanned" or "no matches."
    claim_risk_flags?: string[]
    // M2.20: real per-class OpenFDA recall counts for this competitor's
    // manufacturer/brand identity, per
    // lib/regulatory-engine/manufacturer-credibility.ts's firm-scoped
    // recalling_firm lookup. Purely additive — undefined means "not looked
    // up" or "no recalls found for this exact firm-name string."
    manufacturer_recall_flags?: { class: string; count: number }[]
  }>>

  // Overall aggregation metadata
  providers_used:     EvidencePoint<string[]>
  overall_confidence: EvidencePoint<number>
  failed_providers?:  EvidencePoint<string[]>
}

function dimensionFreshness<T extends SignalScore>(dim: AggregatedDimension<T>): string {
  return new Date().toISOString().slice(0, 10)
}

export function adaptAggregatedSignals(signals: AggregatedSignals, fetchedAt: string): Stage1Evidence {
  const today = fetchedAt.slice(0, 10)

  const result: Stage1Evidence = {
    providers_used: toEvidencePoint(
      signals.providers_used,
      'signal-engine',
      'computed',
      { freshness_date: today }
    ),
    overall_confidence: toEvidencePoint(
      signals.overall_confidence,
      'signal-engine',
      'computed',
      // Honesty fix (2026-07-18 audit, Finding 4): the real computation
      // (lib/signal-engine/engine.ts aggregate(), dimValues.reduce((s,d) =>
      // s+d.confidence,0)/dimValues.length) applies no weights at all — a
      // plain arithmetic mean across populated dimensions. A separate,
      // unrelated SIGNAL_WEIGHTS constant exists in lib/evidence/select.ts
      // but is never referenced by this aggregation. The previous
      // "weighted average" label was a false provenance claim.
      { freshness_date: today, methodology: 'unweighted average of per-dimension confidence scores' }
    ),
  }

  if (signals.failed_providers?.length) {
    result.failed_providers = toEvidencePoint(
      signals.failed_providers,
      'signal-engine',
      'computed',
      { freshness_date: today }
    )
  }

  // Demand dimension
  const demand = signals.demand
  if (demand) {
    if (demand.value.trend) {
      result.trend_direction = toEvidencePoint(
        demand.value.trend,
        demand.primarySource,
        'provider_model',
        { freshness_date: today, scope_note: 'period-over-period comparison from provider' }
      )
    }
    if (demand.value.top_regions?.length) {
      result.top_regions = toEvidencePoint(
        demand.value.top_regions,
        demand.primarySource,
        'primary_measurement',
        { freshness_date: today, scope_note: 'Google Trends interestByRegion, US states' }
      )
    }
  }

  // Competition dimension — Apify data is primary_measurement (real scrape)
  const comp = signals.review_velocity
  if (comp) {
    if (comp.value.meaningful_competitor_count !== undefined) {
      result.competitor_count = toEvidencePoint(
        comp.value.meaningful_competitor_count,
        comp.primarySource,
        'primary_measurement',
        {
          freshness_date: today,
          scope_note: `Products with ≥20 reviews in Amazon organic results for query`,
          sample_size: comp.value.meaningful_competitor_count,
        }
      )
    }
    if (comp.value.review_concentration_ratio !== undefined) {
      result.review_concentration = toEvidencePoint(
        comp.value.review_concentration_ratio,
        comp.primarySource,
        'computed',
        {
          freshness_date: today,
          methodology: 'top-3 review count / total review count across top results',
        }
      )
    }
    if (comp.value.avg_review_count !== undefined) {
      result.avg_competitor_reviews = toEvidencePoint(
        comp.value.avg_review_count,
        comp.primarySource,
        'primary_measurement',
        { freshness_date: today }
      )
    }
    if (comp.value.top_competitors?.length) {
      result.top_competitors = toEvidencePoint(
        comp.value.top_competitors,
        comp.primarySource,
        'primary_measurement',
        {
          freshness_date: today,
          sample_size: comp.value.top_competitors.length,
          scope_note: 'Amazon organic search results, real listing data via Apify',
        }
      )
    }
  }

  // Revenue dimension — Keepa data; avg_price is primary, revenue is provider_model
  const rev = signals.revenue
  if (rev) {
    if (rev.value.avg_referral_fee_pct !== undefined) {
      result.avg_referral_fee_pct = toEvidencePoint(
        rev.value.avg_referral_fee_pct,
        rev.primarySource,
        'primary_measurement',
        {
          freshness_date: today,
          scope_note: "Amazon's own published referral fee schedule, mirrored by Keepa",
          sample_size: rev.value.revenue_sample_count,
        }
      )
    }
    if (rev.value.avg_fba_pick_pack_fee) {
      const feeCents = parseFloat(rev.value.avg_fba_pick_pack_fee.replace(/[^0-9.]/g, ''))
      if (!isNaN(feeCents) && feeCents > 0.25 && feeCents < 25) {
        result.avg_fba_fee = toEvidencePoint(
          feeCents,
          rev.primarySource,
          'primary_measurement',
          {
            freshness_date: today,
            scope_note: 'Amazon FBA pick-and-pack fee (dollars), averaged across top sellers',
            sample_size: rev.value.revenue_sample_count,
          }
        )
      }
    }
    if (rev.value.est_monthly_revenue) {
      const revNum = parseFloat(rev.value.est_monthly_revenue.replace(/[^0-9.]/g, ''))
      if (!isNaN(revNum)) {
        result.est_monthly_revenue = toEvidencePoint(
          revNum,
          rev.primarySource,
          'provider_model',
          {
            freshness_date: today,
            methodology: 'avg_price × avg_monthly_units_sold across top sellers',
            sample_size: rev.value.revenue_sample_count,
          }
        )
      }
    }
    if (rev.value.top_seller_revenue) {
      const topRevNum = parseFloat(rev.value.top_seller_revenue.replace(/[^0-9.]/g, ''))
      if (!isNaN(topRevNum)) {
        result.top_seller_revenue = toEvidencePoint(
          topRevNum,
          rev.primarySource,
          'provider_model',
          {
            freshness_date: today,
            methodology: 'price × monthlySold for the single highest-revenue ASIN in category',
            sample_size: rev.value.revenue_sample_count,
          }
        )
      }
    }
    if (rev.value.est_monthly_units_sold) {
      const unitsNum = parseFloat(rev.value.est_monthly_units_sold.replace(/[^0-9.]/g, ''))
      if (!isNaN(unitsNum) && unitsNum > 0) {
        result.est_monthly_units_sold = toEvidencePoint(
          Math.round(unitsNum),
          rev.primarySource,
          'provider_model',
          {
            freshness_date: today,
            methodology: "Keepa's own monthlySold field averaged across top bestsellers — not a search-volume figure",
            scope_note: 'Category-wide aggregate from bestseller list, not specific to this exact product concept',
            sample_size: rev.value.revenue_sample_count,
          }
        )
      }
    }
    if (rev.value.avg_rating) {
      const ratingNum = parseFloat(rev.value.avg_rating)
      if (!isNaN(ratingNum) && ratingNum > 0) {
        result.avg_market_rating = toEvidencePoint(
          ratingNum,
          rev.primarySource,
          'primary_measurement',
          {
            freshness_date: today,
            scope_note: 'Avg star rating across Keepa category bestsellers (Amazon-mirrored, requires &rating=1)',
            sample_size: rev.value.revenue_sample_count,
          }
        )
      }
    }

    // Price compression — 12-month proxy (avg90 vs avg365) from Keepa
    if (rev.value.price_compression_pct !== undefined && rev.value.price_avg_90d !== undefined && rev.value.price_avg_365d !== undefined) {
      result.price_compression_pct = toEvidencePoint(
        rev.value.price_compression_pct,
        rev.primarySource,
        'computed',
        {
          freshness_date: today,
          methodology: '(avg90_price - avg365_price) / avg365_price × 100; 12-month proxy, not full 24-month window',
          scope_note: 'US Amazon, avg across top bestsellers',
          sample_size: rev.value.revenue_sample_count,
        }
      )
      result.price_avg_90d = toEvidencePoint(rev.value.price_avg_90d, rev.primarySource, 'primary_measurement', { freshness_date: today })
      result.price_avg_365d = toEvidencePoint(rev.value.price_avg_365d, rev.primarySource, 'primary_measurement', { freshness_date: today })
    }
  }

  // Pricing dimension
  const pricing = signals.pricing
  if (pricing) {
    if (pricing.value.avg_price) {
      const priceNum = parseFloat(pricing.value.avg_price.replace(/[^0-9.]/g, ''))
      if (!isNaN(priceNum)) {
        result.median_price = toEvidencePoint(
          priceNum,
          pricing.primarySource,
          'primary_measurement',
          { freshness_date: today, scope_note: 'avg_price across top sellers, US Amazon' }
        )
      }
    }
    if (pricing.value.price_range) {
      const match = pricing.value.price_range.match(/\$?([\d.]+)[–-]\$?([\d.]+)/)
      if (match) {
        const minVal = parseFloat(match[1])
        const maxVal = parseFloat(match[2])
        if (!isNaN(minVal) && !isNaN(maxVal) && minVal > 0 && maxVal >= minVal) {
          result.price_range = toEvidencePoint(
            { min: minVal, max: maxVal },
            pricing.primarySource,
            'primary_measurement',
            { freshness_date: today }
          )
        }
      }
    }
  }

  // Growth dimension
  const growth = signals.growth
  if (growth) {
    if (growth.value.momentum_90d_pct !== null && growth.value.momentum_90d_pct !== undefined) {
      result.momentum_90d_pct = toEvidencePoint(
        growth.value.momentum_90d_pct,
        growth.primarySource,
        'primary_measurement',
        {
          freshness_date: today,
          scope_note: 'Keepa deltaPercent90_monthlySold — real 90-day units-sold momentum',
        }
      )
    }
    if (growth.value.yoy_change) {
      result.yoy_change = toEvidencePoint(
        growth.value.yoy_change,
        growth.primarySource,
        'provider_model',
        { freshness_date: today }
      )
    }
  }

  // Seasonality dimension
  const season = signals.seasonality
  if (season) {
    if (season.value.pattern) {
      result.seasonality_pattern = toEvidencePoint(
        season.value.pattern,
        season.primarySource,
        'provider_model',
        { freshness_date: today }
      )
    }
    if (season.value.peak_months?.length) {
      result.peak_months = toEvidencePoint(
        season.value.peak_months,
        season.primarySource,
        'provider_model',
        { freshness_date: today }
      )
    }
  }

  // Virality dimension
  const viral = signals.virality
  if (viral) {
    if (viral.value.video_count !== undefined) {
      result.tiktok_video_count = toEvidencePoint(
        viral.value.video_count,
        viral.primarySource,
        'primary_measurement',
        { freshness_date: today, scope_note: `TikTok hashtag: ${viral.value.hashtag ?? 'unknown'}` }
      )
    }
    if (viral.value.view_count !== undefined) {
      result.tiktok_view_count = toEvidencePoint(
        viral.value.view_count,
        viral.primarySource,
        'primary_measurement',
        { freshness_date: today, scope_note: `TikTok hashtag: ${viral.value.hashtag ?? 'unknown'}` }
      )
    }
  }

  return result
}
