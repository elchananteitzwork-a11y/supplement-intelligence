'use client'

import type { Stage1Evidence } from '@/lib/evidence/adapter'
import type { DataQualityAssessment, QualityLevel } from '@/lib/quality-gate/gate'
import { HardCard } from '@/components/ui'

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
  strong:   'text-verdict-positive border-verdict-positive',
  adequate: 'text-black border-black',
  thin:     'text-verdict-caution-text border-verdict-caution-text',
  missing:  'text-outline border-outline-variant',
}

const GRADE_COLOR: Record<string, string> = {
  sufficient:   'text-verdict-positive',
  thin:         'text-verdict-caution-text',
  insufficient: 'text-verdict-negative',
}

function SourceTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    primary_measurement: 'Measured',
    provider_model:      'Provider Model',
    ai_synthesis:        'AI Synthesis',
    computed:            'Computed',
  }
  return (
    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 border border-black text-ink-variant bg-white whitespace-nowrap">
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
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-black/10 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-ink">{label}</span>
          <SourceTypeBadge type={source_type} />
        </div>
        <div className="text-[10px] font-mono text-outline mt-0.5">
          {source}
          {scope_note && ` · ${scope_note}`}
          {sample_size !== undefined && ` · n=${sample_size}`}
        </div>
      </div>
      <div className="text-sm font-mono text-ink whitespace-nowrap">
        {typeof value === 'number' ? value.toLocaleString('en-US') : String(value)}
      </div>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-mono font-semibold text-outline uppercase tracking-wider mb-3">
      {children}
    </h2>
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
      <div className="space-y-1 border-b-2 border-black pb-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-headline-md text-black">{signal.query}</h1>
          <span className={`text-sm font-mono font-bold ${GRADE_COLOR[signal.quality_grade]}`}>
            {signal.quality_grade.toUpperCase()}
          </span>
        </div>
        <p className="text-[11px] font-mono text-outline">
          Stage 1 · {new Date(signal.created_at).toLocaleString('en-US')} ·{' '}
          {meta.duration_ms ? `${(meta.duration_ms / 1000).toFixed(1)}s` : '—'} ·{' '}
          Confidence {Math.min(100, Math.round(meta.overall_confidence * 100))}%
        </p>
      </div>

      {/* Pipeline block notice */}
      {signal.pipeline_blocked && (
        <div className="border-2 border-verdict-negative bg-white px-4 py-3 text-sm">
          <p className="font-bold text-verdict-negative mb-1">Pipeline Blocked — Stage 2 unavailable</p>
          <p className="text-verdict-negative text-xs">{signal.blocked_reason}</p>
        </div>
      )}

      {/* Data Quality Gate */}
      <section className="space-y-3">
        <SectionHeading>Data Quality Gate</SectionHeading>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Object.entries(quality.dimensions).map(([key, dim]) => (
            <div
              key={key}
              className={`border px-3 py-2 text-xs bg-white ${QUALITY_COLOR[dim.level as QualityLevel]}`}
            >
              <p className="font-bold capitalize">{key.replace(/_/g, ' ')}</p>
              <p className="text-[11px] mt-0.5 opacity-80">{dim.reason}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-6 text-xs text-ink-variant font-mono">
          <span>Demand signals confirmed: <strong className="text-black">{quality.demand_signals_confirmed}</strong> / 2 required</span>
          <span>Competitors found: <strong className="text-black">{quality.competitor_products_found}</strong> / 5 required</span>
        </div>
      </section>

      {/* Demand & Revenue */}
      <section className="space-y-1">
        <SectionHeading>Demand &amp; Revenue</SectionHeading>
        <HardCard padded={false} className="divide-y divide-black/10 px-4">
          {ev.monthly_search_volume?.value != null && (
            <EvidenceRow
              label="Monthly Search Volume (US)"
              value={`${ev.monthly_search_volume.value.toLocaleString('en-US')}/mo`}
              source={ev.monthly_search_volume.source}
              source_type={ev.monthly_search_volume.source_type}
              scope_note={ev.monthly_search_volume.scope_note}
              sample_size={ev.monthly_search_volume.sample_size}
            />
          )}
          <EvidenceRow
            label="Est. Monthly Revenue (avg seller)"
            value={ev.est_monthly_revenue?.value != null ? `$${Math.round(ev.est_monthly_revenue.value / 1000)}k/mo` : null}
            source={ev.est_monthly_revenue?.source ?? '—'}
            source_type={ev.est_monthly_revenue?.source_type ?? 'computed'}
            scope_note={ev.est_monthly_revenue?.scope_note}
            sample_size={ev.est_monthly_revenue?.sample_size}
          />
          <EvidenceRow
            label="Top Seller Revenue (ceiling)"
            value={ev.top_seller_revenue?.value != null ? `$${Math.round(ev.top_seller_revenue.value / 1000)}k/mo` : null}
            source={ev.top_seller_revenue?.source ?? '—'}
            source_type={ev.top_seller_revenue?.source_type ?? 'provider_model'}
            scope_note={ev.top_seller_revenue?.scope_note}
            sample_size={ev.top_seller_revenue?.sample_size}
          />
          <EvidenceRow
            label="Monthly Units Sold (avg top sellers)"
            value={ev.est_monthly_units_sold?.value != null ? `${ev.est_monthly_units_sold.value.toLocaleString('en-US')} units/mo` : null}
            source={ev.est_monthly_units_sold?.source ?? '—'}
            source_type={ev.est_monthly_units_sold?.source_type ?? 'provider_model'}
            scope_note={ev.est_monthly_units_sold?.scope_note}
            sample_size={ev.est_monthly_units_sold?.sample_size}
          />
          <EvidenceRow
            label="Avg Market Rating (bestsellers)"
            value={ev.avg_market_rating?.value != null ? `★${ev.avg_market_rating.value.toFixed(1)}` : null}
            source={ev.avg_market_rating?.source ?? '—'}
            source_type={ev.avg_market_rating?.source_type ?? 'primary_measurement'}
            scope_note={ev.avg_market_rating?.scope_note}
            sample_size={ev.avg_market_rating?.sample_size}
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
        </HardCard>
      </section>

      {/* Pricing & Price Compression */}
      <section className="space-y-1">
        <SectionHeading>Pricing</SectionHeading>
        <HardCard padded={false} className="divide-y divide-black/10 px-4">
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
            <div className="flex items-start justify-between gap-4 py-2.5">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-ink">Price compression (90d vs 12mo)</span>
                  <SourceTypeBadge type="computed" />
                </div>
                <div className="text-[10px] font-mono text-outline mt-0.5">
                  {ev.price_compression_pct?.source} ·{' '}
                  avg90 ${ev.price_avg_90d?.value?.toFixed(2) ?? 'N/A'} vs avg365 ${ev.price_avg_365d?.value?.toFixed(2) ?? 'N/A'} ·
                  12-month proxy (not full 24-month window)
                </div>
              </div>
              <div className={`text-sm font-mono whitespace-nowrap ${
                (priceCompressionPct ?? 0) < -10 ? 'text-verdict-negative' :
                (priceCompressionPct ?? 0) < -3  ? 'text-verdict-caution-text' :
                'text-ink'
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
        </HardCard>
      </section>

      {/* PPC Economics */}
      {ev.ppc_economics?.value && (() => {
        const ppc = ev.ppc_economics!.value
        const riskColor =
          ppc.ppc_risk_level === 'Low'     ? 'text-verdict-positive border-verdict-positive' :
          ppc.ppc_risk_level === 'Medium'  ? 'text-verdict-caution-text border-verdict-caution-text' :
          ppc.ppc_risk_level === 'High'    ? 'text-verdict-negative border-verdict-negative' :
                                             'text-white bg-verdict-negative border-verdict-negative'
        return (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <SectionHeading>PPC Economics (Estimated)</SectionHeading>
              <SourceTypeBadge type="computed" />
            </div>
            <HardCard className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-sm font-bold px-3 py-1 border ${riskColor}`}>
                  {ppc.ppc_risk_level} PPC Risk
                </span>
                <span className={`text-xs px-2 py-0.5 border font-mono uppercase ${ppc.paid_viable ? 'border-verdict-positive text-verdict-positive' : 'border-verdict-negative text-verdict-negative'}`}>
                  Paid launch {ppc.paid_viable ? 'viable' : 'not viable'}
                </span>
              </div>
              <p className="text-xs text-ink-variant">{ppc.risk_reason}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {ppc.google_cpc_p50 !== null && (
                  <div>
                    <p className="text-outline">Google CPC (p50)</p>
                    <p className="text-ink font-mono">${ppc.google_cpc_p50.toFixed(2)}</p>
                    <p className="text-[10px] text-outline">DataForSEO · real</p>
                  </div>
                )}
                {ppc.amazon_ppc_high !== null && (
                  <div>
                    <p className="text-outline">Est. Amazon PPC</p>
                    <p className="text-ink font-mono">${ppc.amazon_ppc_low?.toFixed(2)}–${ppc.amazon_ppc_high.toFixed(2)}</p>
                    <p className="text-[10px] text-outline">Derived estimate · NOT real Amazon Ads</p>
                  </div>
                )}
                {ppc.est_acos_pct !== null && (
                  <div>
                    <p className="text-outline">Est. ACOS (launch)</p>
                    <p className={`font-mono font-bold ${ppc.est_acos_pct > 50 ? 'text-verdict-negative' : ppc.est_acos_pct > 30 ? 'text-verdict-caution-text' : 'text-verdict-positive'}`}>
                      {ppc.est_acos_pct}%
                    </p>
                    <p className="text-[10px] text-outline">At {ppc.est_conversion_rate_pct}% conv. rate</p>
                  </div>
                )}
                {ppc.headroom_after_ads !== null && (
                  <div>
                    <p className="text-outline">Headroom after ads</p>
                    <p className={`font-mono font-bold ${ppc.headroom_after_ads > 0 ? 'text-ink' : 'text-verdict-negative'}`}>
                      ${ppc.headroom_after_ads.toFixed(2)}/unit
                    </p>
                    <p className="text-[10px] text-outline">Before COGS</p>
                  </div>
                )}
              </div>
              {ppc.est_tacos_pct_low !== null && ppc.est_tacos_pct_high !== null && (
                <p className="text-[10px] text-outline">
                  Est. TACoS range: {ppc.est_tacos_pct_low}–{ppc.est_tacos_pct_high}% ·
                  CPC from Google Ads (DataForSEO) · {ppc.keywords_with_cpc} keywords with real CPC data
                </p>
              )}
            </HardCard>
          </section>
        )
      })()}

      {/* Competition */}
      <section className="space-y-1">
        <SectionHeading>Competition</SectionHeading>
        <HardCard padded={false} className="divide-y divide-black/10 px-4">
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
        </HardCard>

        {/* Top competitors table */}
        {ev.top_competitors?.value?.length ? (
          <div className="mt-3 border border-black overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-black text-outline bg-surface-container-low">
                  <th className="px-3 py-2 text-left font-mono uppercase tracking-wide">#</th>
                  <th className="px-3 py-2 text-left font-mono uppercase tracking-wide">Brand</th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-wide">Reviews</th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-wide">Rating</th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-wide">Price</th>
                </tr>
              </thead>
              <tbody>
                {ev.top_competitors.value.slice(0, 10).map((c, i) => (
                  <tr key={c.productId} className="border-b border-black/10 hover:bg-surface-container-low">
                    <td className="px-3 py-2 text-outline">{c.position ?? i + 1}</td>
                    <td className="px-3 py-2 text-ink max-w-[160px] truncate">{c.brand}</td>
                    <td className="px-3 py-2 text-right text-ink-variant font-mono">{(c.reviewCount ?? 0).toLocaleString('en-US')}</td>
                    <td className="px-3 py-2 text-right text-ink-variant font-mono">{(c.rating ?? 0).toFixed(1)}</td>
                    <td className="px-3 py-2 text-right text-ink-variant font-mono">${(c.price ?? 0).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[10px] text-outline border-t border-black">
              Source: {ev.top_competitors.source} ·{' '}
              <SourceTypeBadge type={ev.top_competitors.source_type} /> ·{' '}
              {ev.top_competitors.scope_note}
            </p>
          </div>
        ) : null}

        {/* Ranking difficulty panel */}
        {ev.ranking_difficulty?.value && (() => {
          const rd = ev.ranking_difficulty!.value
          const diffColor =
            rd.page1_difficulty === 'Low'     ? 'text-verdict-positive border-verdict-positive' :
            rd.page1_difficulty === 'Medium'  ? 'text-verdict-caution-text border-verdict-caution-text' :
            rd.page1_difficulty === 'High'    ? 'text-verdict-negative border-verdict-negative' :
                                                'text-white bg-verdict-negative border-verdict-negative'
          return (
            <HardCard className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-mono font-semibold text-outline uppercase tracking-wider">
                  Amazon Ranking Difficulty
                </p>
                <SourceTypeBadge type="computed" />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-sm font-bold px-3 py-1 border ${diffColor}`}>
                  {rd.page1_difficulty} Difficulty
                </span>
                {rd.is_review_protected && (
                  <span className="text-xs px-2 py-0.5 border border-verdict-negative text-verdict-negative font-mono uppercase">
                    Review-protected market
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-outline">Median top-5 reviews</p>
                  <p className="text-ink font-mono font-bold">{(rd.median_reviews_top5 ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-outline">Avg top-10 reviews</p>
                  <p className="text-ink font-mono">{(rd.avg_reviews_top10 ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-outline">Reviews to compete</p>
                  <p className="text-ink font-mono font-bold">~{(rd.reviews_to_compete ?? 0).toLocaleString()}</p>
                </div>
              </div>
              <p className="text-[10px] text-outline">{rd.sample_note} · reviews to compete = 70% of median top-5</p>
            </HardCard>
          )
        })()}
      </section>

      {/* Social & Virality */}
      <section className="space-y-1">
        <SectionHeading>Social Demand</SectionHeading>
        <HardCard padded={false} className="divide-y divide-black/10 px-4">
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
        </HardCard>
      </section>

      {/* Regulatory Intelligence */}
      {ev.regulatory_intelligence?.value && (() => {
        const reg = ev.regulatory_intelligence!.value
        const riskColor: Record<string, string> = {
          Low:      'text-verdict-positive border-verdict-positive',
          Medium:   'text-verdict-caution-text border-verdict-caution-text',
          High:     'text-verdict-negative border-verdict-negative',
          Critical: 'text-white bg-verdict-negative border-verdict-negative',
        }
        const ae  = reg.adverse_events
        const rec = reg.recalls
        return (
          <section className="space-y-3">
            <SectionHeading>Regulatory Intelligence</SectionHeading>
            <HardCard className={`space-y-3 border-2 ${riskColor[reg.risk_level]?.split(' ')[1] ?? 'border-black'}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-xs font-bold px-2 py-0.5 border ${riskColor[reg.risk_level] ?? riskColor.Low}`}>
                  {reg.risk_level} Risk
                </span>
                <span className="text-xs text-ink-variant">{reg.risk_summary}</span>
              </div>

              {ae && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-outline mb-0.5">FAERS Reports</p>
                    <p className="font-mono text-ink">{ae.total_reports.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-outline mb-0.5">Serious Events</p>
                    <p className="font-mono text-ink">{ae.serious_reports.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-outline mb-0.5">Hospitalizations</p>
                    <p className={`font-mono ${ae.hospitalization_count > 20 ? 'text-verdict-negative' : 'text-ink'}`}>
                      {ae.hospitalization_count.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-outline mb-0.5">Deaths</p>
                    <p className={`font-mono ${ae.death_count > 0 ? 'text-verdict-negative' : 'text-ink'}`}>
                      {ae.death_count.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {ae?.top_reactions.length ? (
                <div className="text-xs">
                  <span className="text-outline">Top reported reactions: </span>
                  <span className="text-ink-variant">{ae.top_reactions.join(', ')}</span>
                </div>
              ) : null}

              {rec && rec.total_recalls > 0 && (
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-outline">Recalls on record:</span>
                    <span className="font-mono text-ink">{rec.total_recalls}</span>
                    {rec.class_i_recalls > 0 && (
                      <span className="text-verdict-negative font-bold">Class I: {rec.class_i_recalls}</span>
                    )}
                    {rec.class_ii_recalls > 0 && (
                      <span className="text-verdict-caution-text">Class II: {rec.class_ii_recalls}</span>
                    )}
                  </div>
                  {rec.recent_recall_descriptions.map((d, i) => (
                    <p key={i} className="text-outline pl-3 border-l border-black/20">{d}</p>
                  ))}
                </div>
              )}

              {reg.warning_flags.length > 0 && (
                <div className="text-xs space-y-1">
                  {reg.warning_flags.map((f, i) => (
                    <p key={i} className="text-verdict-caution-text">⚑ {f}</p>
                  ))}
                </div>
              )}

              <p className="text-[10px] text-outline leading-snug">{reg.disclaimer}</p>
            </HardCard>
          </section>
        )
      })()}

      {/* Provider metadata */}
      <HardCard className="space-y-2">
        <h2 className="text-[10px] font-mono font-semibold text-outline uppercase tracking-wider">
          Provider Metadata
        </h2>
        <div className="flex flex-wrap gap-2">
          {meta.providers_used.map(p => (
            <span key={p} className="text-xs bg-white border border-black text-ink-variant px-2 py-0.5 font-mono">
              {p}
            </span>
          ))}
          {meta.failed_providers?.map(p => (
            <span key={p} className="text-xs bg-white border border-verdict-negative text-verdict-negative px-2 py-0.5 font-mono">
              {p} (failed)
            </span>
          ))}
        </div>
        <p className="text-xs text-outline">
          Overall confidence: {Math.min(100, Math.round(meta.overall_confidence * 100))}% ·{' '}
          Fetched at: {meta.fetched_at ? new Date(meta.fetched_at).toLocaleString('en-US') : '—'}
        </p>
      </HardCard>
    </div>
  )
}
