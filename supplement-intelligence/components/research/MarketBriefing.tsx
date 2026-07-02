'use client'

import type { Stage1Evidence } from '@/lib/evidence/adapter'
import type { DataQualityAssessment, QualityLevel } from '@/lib/quality-gate/gate'

interface MarketSignalRow {
  id: string
  query: string
  quality_grade: 'sufficient' | 'thin' | 'insufficient'
  pipeline_blocked: boolean
  blocked_reason: string | null
  created_at: string
  signal_data: Stage1Evidence
  quality_detail: DataQualityAssessment
  provider_metadata: {
    providers_used: string[]
    failed_providers: string[]
    overall_confidence: number
    duration_ms: number
    fetched_at: string
  }
}

const QUALITY_COLOR: Record<QualityLevel, string> = {
  strong:   'text-green-400 bg-green-950/40 border-green-800',
  adequate: 'text-blue-400 bg-blue-950/40 border-blue-800',
  thin:     'text-yellow-400 bg-yellow-950/40 border-yellow-800',
  missing:  'text-gray-400 bg-gray-900 border-gray-700',
}

const GRADE_COLOR: Record<string, string> = {
  sufficient:   'text-green-400',
  thin:         'text-yellow-400',
  insufficient: 'text-red-400',
}

function SourceTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    primary_measurement: 'bg-green-950 text-green-300 border-green-800',
    provider_model:      'bg-blue-950 text-blue-300 border-blue-800',
    ai_synthesis:        'bg-purple-950 text-purple-300 border-purple-800',
    computed:            'bg-gray-800 text-gray-300 border-gray-700',
  }
  const labels: Record<string, string> = {
    primary_measurement: 'Measured',
    provider_model:      'Provider Model',
    ai_synthesis:        'AI Synthesis',
    computed:            'Computed',
  }
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${styles[type] ?? styles.computed}`}>
      {labels[type] ?? type}
    </span>
  )
}

function EvidenceRow({
  label,
  value,
  source,
  source_type,
  scope_note,
  sample_size,
}: {
  label: string
  value: string | number | null | undefined
  source: string
  source_type: string
  scope_note?: string
  sample_size?: number
}) {
  if (value == null) return null
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-800 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-200">{label}</span>
          <SourceTypeBadge type={source_type} />
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {source}
          {scope_note && ` · ${scope_note}`}
          {sample_size !== undefined && ` · n=${sample_size}`}
        </div>
      </div>
      <div className="text-sm font-mono text-gray-100 whitespace-nowrap">
        {typeof value === 'number' ? value.toLocaleString() : String(value)}
      </div>
    </div>
  )
}

export function MarketBriefing({ signal }: { signal: MarketSignalRow }) {
  const ev = signal.signal_data
  const quality = signal.quality_detail
  const meta = signal.provider_metadata

  const priceCompressionPct = ev.price_compression_pct?.value
  const compressionLabel = priceCompressionPct != null
    ? priceCompressionPct < -10
      ? `${priceCompressionPct}% — Significant compression (Kill Switch #4 risk)`
      : priceCompressionPct < -3
      ? `${priceCompressionPct}% — Mild compression`
      : priceCompressionPct > 3
      ? `+${priceCompressionPct}% — Prices rising`
      : `${priceCompressionPct}% — Stable pricing`
    : null

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">{signal.query}</h1>
          <span className={`text-base font-mono ${GRADE_COLOR[signal.quality_grade]}`}>
            {signal.quality_grade.toUpperCase()}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          Stage 1 · {new Date(signal.created_at).toLocaleString()} ·{' '}
          {meta.duration_ms ? `${(meta.duration_ms / 1000).toFixed(1)}s` : '—'} ·{' '}
          Confidence {Math.round(meta.overall_confidence * 100)}%
        </p>
      </div>

      {/* Pipeline block notice */}
      {signal.pipeline_blocked && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm">
          <p className="font-medium text-red-400 mb-1">Pipeline Blocked — Stage 2 unavailable</p>
          <p className="text-red-300 text-xs">{signal.blocked_reason}</p>
        </div>
      )}

      {/* Data Quality Gate */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Data Quality Gate
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Object.entries(quality.dimensions).map(([key, dim]) => (
            <div
              key={key}
              className={`rounded-lg border px-3 py-2 text-xs ${QUALITY_COLOR[dim.level as QualityLevel]}`}
            >
              <p className="font-medium capitalize">{key.replace(/_/g, ' ')}</p>
              <p className="text-[11px] mt-0.5 opacity-80">{dim.reason}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-6 text-xs text-gray-400">
          <span>Demand signals confirmed: <strong className="text-gray-200">{quality.demand_signals_confirmed}</strong> / 2 required</span>
          <span>Competitors found: <strong className="text-gray-200">{quality.competitor_products_found}</strong> / 5 required</span>
        </div>
      </section>

      {/* Demand & Revenue */}
      <section className="space-y-1">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
          Demand & Revenue
        </h2>
        <div className="rounded-lg border border-gray-800 divide-y divide-gray-800">
          <EvidenceRow
            label="Est. Monthly Revenue (avg seller)"
            value={ev.est_monthly_revenue?.value != null ? `$${Math.round(ev.est_monthly_revenue.value / 1000)}k/mo` : null}
            source={ev.est_monthly_revenue?.source ?? '—'}
            source_type={ev.est_monthly_revenue?.source_type ?? 'computed'}
            scope_note={ev.est_monthly_revenue?.scope_note}
            sample_size={ev.est_monthly_revenue?.sample_size}
          />
          <EvidenceRow
            label="Trend direction"
            value={ev.trend_direction?.value}
            source={ev.trend_direction?.source ?? '—'}
            source_type={ev.trend_direction?.source_type ?? 'provider_model'}
          />
          <EvidenceRow
            label="90-day momentum"
            value={ev.momentum_90d_pct?.value != null ? `${ev.momentum_90d_pct.value}%` : null}
            source={ev.momentum_90d_pct?.source ?? '—'}
            source_type={ev.momentum_90d_pct?.source_type ?? 'primary_measurement'}
            scope_note={ev.momentum_90d_pct?.scope_note}
          />
          <EvidenceRow
            label="YoY change"
            value={ev.yoy_change?.value}
            source={ev.yoy_change?.source ?? '—'}
            source_type={ev.yoy_change?.source_type ?? 'provider_model'}
          />
        </div>
      </section>

      {/* Pricing & Price Compression */}
      <section className="space-y-1">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
          Pricing
        </h2>
        <div className="rounded-lg border border-gray-800 divide-y divide-gray-800">
          <EvidenceRow
            label="Median price (avg90)"
            value={ev.median_price?.value != null ? `$${ev.median_price.value}` : null}
            source={ev.median_price?.source ?? '—'}
            source_type={ev.median_price?.source_type ?? 'primary_measurement'}
            scope_note={ev.median_price?.scope_note}
          />
          <EvidenceRow
            label="Price range"
            value={ev.price_range?.value != null
              ? `$${ev.price_range.value.min} – $${ev.price_range.value.max}`
              : null}
            source={ev.price_range?.source ?? '—'}
            source_type={ev.price_range?.source_type ?? 'primary_measurement'}
          />
          {compressionLabel && (
            <div className="flex items-start justify-between gap-4 py-2 px-0">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-200">Price compression (90d vs 12mo)</span>
                  <SourceTypeBadge type="computed" />
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {ev.price_compression_pct?.source} ·{' '}
                  avg90 ${ev.price_avg_90d?.value?.toFixed(2)} vs avg365 ${ev.price_avg_365d?.value?.toFixed(2)} ·
                  12-month proxy (not full 24-month window)
                </div>
              </div>
              <div className={`text-sm font-mono whitespace-nowrap ${
                (priceCompressionPct ?? 0) < -10 ? 'text-red-400' :
                (priceCompressionPct ?? 0) < -3  ? 'text-yellow-400' :
                'text-gray-100'
              }`}>
                {compressionLabel}
              </div>
            </div>
          )}
          <EvidenceRow
            label="Avg FBA pick-and-pack fee"
            value={ev.avg_fba_fee?.value != null ? `$${ev.avg_fba_fee.value.toFixed(2)}` : null}
            source={ev.avg_fba_fee?.source ?? '—'}
            source_type={ev.avg_fba_fee?.source_type ?? 'primary_measurement'}
            scope_note={ev.avg_fba_fee?.scope_note}
            sample_size={ev.avg_fba_fee?.sample_size}
          />
          <EvidenceRow
            label="Avg referral fee %"
            value={ev.avg_referral_fee_pct?.value != null ? `${ev.avg_referral_fee_pct.value}%` : null}
            source={ev.avg_referral_fee_pct?.source ?? '—'}
            source_type={ev.avg_referral_fee_pct?.source_type ?? 'primary_measurement'}
            scope_note={ev.avg_referral_fee_pct?.scope_note}
          />
        </div>
      </section>

      {/* Competition */}
      <section className="space-y-1">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
          Competition
        </h2>
        <div className="rounded-lg border border-gray-800 divide-y divide-gray-800">
          <EvidenceRow
            label="Meaningful competitors (≥20 reviews)"
            value={ev.competitor_count?.value}
            source={ev.competitor_count?.source ?? '—'}
            source_type={ev.competitor_count?.source_type ?? 'primary_measurement'}
            scope_note={ev.competitor_count?.scope_note}
            sample_size={ev.competitor_count?.sample_size}
          />
          <EvidenceRow
            label="Avg competitor review count"
            value={ev.avg_competitor_reviews?.value}
            source={ev.avg_competitor_reviews?.source ?? '—'}
            source_type={ev.avg_competitor_reviews?.source_type ?? 'primary_measurement'}
          />
          <EvidenceRow
            label="Review concentration ratio (top 3)"
            value={ev.review_concentration?.value != null
              ? `${Math.round(ev.review_concentration.value * 100)}%`
              : null}
            source={ev.review_concentration?.source ?? '—'}
            source_type={ev.review_concentration?.source_type ?? 'computed'}
            scope_note={ev.review_concentration?.methodology}
          />
        </div>

        {/* Top competitors table */}
        {ev.top_competitors?.value?.length ? (
          <div className="mt-3 rounded-lg border border-gray-800 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Brand</th>
                  <th className="px-3 py-2 text-right font-medium">Reviews</th>
                  <th className="px-3 py-2 text-right font-medium">Rating</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {ev.top_competitors.value.slice(0, 10).map((c, i) => (
                  <tr key={c.productId} className="border-b border-gray-900 hover:bg-gray-900/50">
                    <td className="px-3 py-2 text-gray-500">{c.position ?? i + 1}</td>
                    <td className="px-3 py-2 text-gray-200 max-w-[160px] truncate">{c.brand}</td>
                    <td className="px-3 py-2 text-right text-gray-300">{c.reviewCount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-gray-300">{c.rating.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right text-gray-300">${c.price.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[10px] text-gray-600">
              Source: {ev.top_competitors.source} ·{' '}
              <SourceTypeBadge type={ev.top_competitors.source_type} /> ·{' '}
              {ev.top_competitors.scope_note}
            </p>
          </div>
        ) : null}
      </section>

      {/* Social & Virality */}
      <section className="space-y-1">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
          Social Demand
        </h2>
        <div className="rounded-lg border border-gray-800 divide-y divide-gray-800">
          <EvidenceRow
            label="TikTok videos"
            value={ev.tiktok_video_count?.value}
            source={ev.tiktok_video_count?.source ?? '—'}
            source_type={ev.tiktok_video_count?.source_type ?? 'primary_measurement'}
            scope_note={ev.tiktok_video_count?.scope_note}
          />
          <EvidenceRow
            label="TikTok total views"
            value={ev.tiktok_view_count?.value}
            source={ev.tiktok_view_count?.source ?? '—'}
            source_type={ev.tiktok_view_count?.source_type ?? 'primary_measurement'}
            scope_note={ev.tiktok_view_count?.scope_note}
          />
          <EvidenceRow
            label="Top demand regions"
            value={ev.top_regions?.value?.join(', ')}
            source={ev.top_regions?.source ?? '—'}
            source_type={ev.top_regions?.source_type ?? 'primary_measurement'}
            scope_note={ev.top_regions?.scope_note}
          />
        </div>
      </section>

      {/* Provider metadata */}
      <section className="rounded-lg border border-gray-800 px-4 py-3 space-y-2">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Provider Metadata
        </h2>
        <div className="flex flex-wrap gap-2">
          {meta.providers_used.map(p => (
            <span key={p} className="text-xs bg-gray-800 border border-gray-700 text-gray-300 px-2 py-0.5 rounded">
              {p}
            </span>
          ))}
          {meta.failed_providers?.map(p => (
            <span key={p} className="text-xs bg-red-950 border border-red-800 text-red-400 px-2 py-0.5 rounded">
              {p} (failed)
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          Overall confidence: {Math.round(meta.overall_confidence * 100)}% ·{' '}
          Fetched at: {meta.fetched_at ? new Date(meta.fetched_at).toLocaleString() : '—'}
        </p>
      </section>
    </div>
  )
}
