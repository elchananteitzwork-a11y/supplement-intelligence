'use client'

// ═══════════════════════════════════════════════════════════════════════
// Keyword Intelligence — real per-keyword search data from DataForSEO
// (m.keyword_intelligence, server-captured, never touched by the model),
// plus clusters/opportunity discovery/seasonality/forecast/per-keyword
// scores computed deterministically over those real numbers, plus one
// narrow AI narrative pass (ai_insights). Direct successor to
// KeywordIntelligenceContent in the old components/MemoDisplay.tsx.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import type { MemoData } from '@/types/index'
import type { KeywordMetric, KeywordIntelligence as KeywordIntelligenceData, KeywordCluster, KeywordAIInsights } from '@/lib/keyword-engine/types'
import { HardCard } from '@/components/ui'
import {
  searchVolumeProvenance, keywordIntelligenceProvenance, keywordSeasonalityProvenance, keywordForecastProvenance,
  keywordOpportunityScoreProvenance, keywordClusterProvenance, keywordClickConversionProvenance,
  keywordAmazonPpcProvenance, keywordSearchIntentProvenance,
} from '@/lib/provenance'
import { VolumeTrendChart, SeasonalityChart, ForecastChart, OpportunityHeatmap, ClusterDistributionChart } from './KeywordCharts'
import { ProvenanceBadge, ProvenanceCaption, LabNoData, LabEmptyState, SectionIntro } from './shared'
import { IconBeaker } from '@/components/icons'

function KeywordTable({ keywords }: { keywords: KeywordMetric[] }) {
  if (keywords.length === 0) return <p className="text-xs text-outline italic py-3">No keywords met this bucket's criteria for this query.</p>
  return (
    <div className="overflow-x-auto border border-black">
      <table className="w-full text-sm min-w-[420px]">
        <thead>
          <tr className="bg-surface-container text-[10px] text-outline uppercase tracking-wider">
            <th className="text-left py-2.5 px-3">Keyword</th>
            <th className="text-right py-2.5 px-3">Monthly Searches</th>
            <th className="text-right py-2.5 px-3">Growth</th>
            <th className="text-right py-2.5 px-3 hidden sm:table-cell">Difficulty</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((k, i) => (
            <tr key={i} className="border-t border-black hover:bg-surface-container-low transition-colors">
              <td className="py-2.5 px-3 font-medium text-black">{k.keyword}</td>
              <td className="py-2.5 px-3 text-right font-mono text-ink-variant">{k.monthly_searches.toLocaleString()}</td>
              <td className={`py-2.5 px-3 text-right font-mono ${k.growth_pct === null ? 'text-outline' : k.growth_pct >= 0 ? 'text-verdict-positive' : 'text-verdict-negative'}`}>
                {k.growth_pct === null ? '—' : `${k.growth_pct >= 0 ? '+' : ''}${k.growth_pct}%`}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-outline hidden sm:table-cell">{k.difficulty ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ExpandableKeywordTable({ keywords, collapseAt = 5 }: { keywords: KeywordMetric[]; collapseAt?: number }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? keywords : keywords.slice(0, collapseAt)
  const hidden = Math.max(0, keywords.length - collapseAt)
  return (
    <div>
      <KeywordTable keywords={shown} />
      {hidden > 0 && !expanded && (
        <button onClick={() => setExpanded(true)} className="text-[11px] text-black hover:underline transition-colors mt-2">Show {hidden} more →</button>
      )}
    </div>
  )
}

function KeywordDataQualityBar({ ki }: { ki: KeywordIntelligenceData }) {
  const pct = ki.confidence !== undefined ? Math.round(ki.confidence * 100) : null
  return (
    <div className="flex items-center gap-x-5 gap-y-1.5 flex-wrap text-[10px] text-outline bg-surface-container-low border border-black px-3.5 py-2.5">
      <span>Seed: <span className="font-mono text-ink-variant">&ldquo;{ki.seed_keyword}&rdquo;</span></span>
      <span>Source: <span className="font-mono text-ink-variant">{ki.provider === 'dataforseo' ? 'DataForSEO' : ki.provider}</span></span>
      {pct !== null && <span>Real-data completeness: <span className="font-mono text-ink-variant">{pct}%</span></span>}
      <span>Last updated: <span className="font-mono text-ink-variant">{new Date(ki.fetched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span></span>
    </div>
  )
}

function KeywordClusterCard({ cluster }: { cluster: KeywordCluster }) {
  return (
    <HardCard>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <p className="text-xs font-semibold text-black">{cluster.label}</p>
        <span className="font-mono text-[10px] text-outline">{cluster.keywords.length}</span>
      </div>
      <p className="text-[10px] text-outline mb-3">{cluster.basis}</p>
      <ExpandableKeywordTable keywords={cluster.keywords} collapseAt={5} />
    </HardCard>
  )
}

function KeywordOpportunityDiscoverySection({ opp }: { opp: NonNullable<KeywordIntelligenceData['opportunities']> }) {
  const groups = [
    { label: 'High Volume + Low Competition', keywords: opp.high_volume_low_competition, hint: 'Real volume ≥1,000/mo with real competition index ≤0.35.' },
    { label: 'Fastest Growing',               keywords: opp.fastest_growing,             hint: 'Real positive YoY growth (DataForSEO history), sorted highest first.' },
    { label: 'Highest Commercial Intent',     keywords: opp.highest_commercial_intent,   hint: 'Classified commercial/transactional intent, sorted by real volume.' },
    { label: 'White-space Opportunities',     keywords: opp.white_space,                 hint: 'Real high volume + low competition + low difficulty + no real competitor brand overlap.' },
  ]
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        {groups.map(g => (
          <HardCard key={g.label}>
            <p className="text-xs font-semibold text-black mb-1">{g.label}</p>
            <p className="text-[10px] text-outline mb-3">{g.hint}</p>
            <ExpandableKeywordTable keywords={g.keywords} collapseAt={5} />
          </HardCard>
        ))}
      </div>
      {opp.not_buildable.length > 0 && (
        <div className="bg-surface-container-low border border-black px-4 py-3">
          <p className="text-[10px] text-outline uppercase tracking-wider mb-2">Requested, Not Currently Buildable With Real Data</p>
          <ul className="space-y-1.5">
            {opp.not_buildable.map(item => (
              <li key={item.label} className="text-[11px] text-outline">
                <span className="text-ink-variant font-medium">{item.label}:</span> {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ProductImpactStat({ label, value, provenance }: { label: string; value: string; provenance: ReturnType<typeof keywordClickConversionProvenance> | null }) {
  return (
    <div className="bg-surface-container-low border border-black px-3 py-2.5">
      <p className="text-[9px] text-outline uppercase tracking-wider mb-1">{label}</p>
      <p className="font-mono text-sm font-semibold text-black">{value}</p>
      {provenance && <div className="mt-1.5"><ProvenanceBadge p={provenance} /></div>}
    </div>
  )
}

function KeywordAIInsightsPanel({ insights }: { insights: KeywordAIInsights }) {
  const rows: [string, string][] = [
    ['Top Opportunities', insights.top_opportunities], ['Biggest Risks', insights.biggest_risks],
    ['Hidden Demand', insights.hidden_demand], ['Keyword Strategy', insights.keyword_strategy],
    ['SEO Strategy', insights.seo_strategy], ['Amazon Strategy', insights.amazon_strategy], ['Google Strategy', insights.google_strategy],
  ]
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-variant leading-relaxed italic">{insights.summary}</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {rows.filter(([, v]) => v).map(([label, text]) => (
          <div key={label} className="border border-black p-3.5">
            <p className="text-[10px] text-outline uppercase tracking-wider mb-1.5">{label}</p>
            <p className="text-xs text-ink-variant leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
      <ProvenanceCaption p={{ level: 'estimated', source: 'Claude (AI synthesis over real DataForSEO data)', detail: 'Narrative strategy notes written over the real keyword numbers above — not independently verified for correctness.' }} />
    </div>
  )
}

export default function KeywordIntelligence({ m }: { m: MemoData }) {
  const ki = m.keyword_intelligence

  if (!ki) {
    return (
      <div>
        <SectionIntro text="Real per-keyword search data — volume, growth, competition, difficulty, and CPC — pulled directly from DataForSEO. Clusters, opportunity scores, and AI strategy notes are computed from those real numbers, never invented." />
        <LabEmptyState
          icon={<IconBeaker className="w-5 h-5" />}
          title="No keyword data found"
          description="DataForSEO has no search-volume data for this exact phrase or any broadened form of it. This usually means the concept is novel or coined — no one is searching for it by name yet."
        />
      </div>
    )
  }

  const allMetrics = [...ki.top_buying, ...ki.opportunity, ...ki.long_tail, ...ki.fast_growing]
  const topKeyword  = [...allMetrics].sort((a, b) => b.monthly_searches - a.monthly_searches)[0] as KeywordMetric | undefined
  const hasHistory  = (topKeyword?.monthly_history?.length ?? 0) >= 6
  const volProv     = searchVolumeProvenance(ki)
  const kiProv      = keywordIntelligenceProvenance(ki)

  return (
    <div className="space-y-8">
      <SectionIntro text="Every chart and table below traces back to a real DataForSEO number. Clusters and scores are disclosed formulas over those real numbers; AI Insights at the bottom is the only narrative/interpretive layer." />
      <KeywordDataQualityBar ki={ki} />

      {hasHistory && topKeyword?.monthly_history && volProv && (
        <HardCard>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-black">Search Demand — &ldquo;{topKeyword.keyword}&rdquo;</p>
            <ProvenanceBadge p={volProv} />
          </div>
          <VolumeTrendChart history={topKeyword.monthly_history} />
        </HardCard>
      )}

      {ki.seasonality && topKeyword?.monthly_history && (
        <HardCard>
          <div className="flex items-center justify-between gap-3 mb-1">
            <p className="text-xs font-semibold text-black">Seasonality</p>
            <ProvenanceBadge p={keywordSeasonalityProvenance(ki)!} />
          </div>
          <p className="text-[11px] text-outline mb-3">
            Pattern: <span className="text-ink-variant font-medium">{ki.seasonality.pattern}</span>
            {ki.seasonality.peak_months.length > 0 && <> · Peak: <span className="text-verdict-positive">{ki.seasonality.peak_months.join(', ')}</span></>}
            {ki.seasonality.low_months.length > 0  && <> · Low: <span className="text-verdict-negative">{ki.seasonality.low_months.join(', ')}</span></>}
          </p>
          <SeasonalityChart history={topKeyword.monthly_history} seasonality={ki.seasonality} />
        </HardCard>
      )}

      {ki.forecast_12mo && ki.forecast_12mo.length > 0 && (
        <HardCard>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-black">12-Month Forecast — &ldquo;{topKeyword?.keyword}&rdquo;</p>
            <ProvenanceBadge p={keywordForecastProvenance(ki)!} />
          </div>
          <ForecastChart forecast={ki.forecast_12mo} />
        </HardCard>
      )}

      <div className="grid sm:grid-cols-2 gap-5">
        <HardCard>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-black">Opportunity Heatmap</p>
            <ProvenanceBadge p={keywordOpportunityScoreProvenance()} />
          </div>
          <OpportunityHeatmap metrics={allMetrics} />
          <p className="text-[10px] text-outline mt-2">X: real competition index · Y: real volume (log) · size/color: computed opportunity score</p>
        </HardCard>
        {ki.clusters && ki.clusters.length > 0 && (
          <HardCard>
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-semibold text-black">Keyword Distribution by Cluster</p>
              <ProvenanceBadge p={keywordClusterProvenance()} />
            </div>
            <ClusterDistributionChart clusters={ki.clusters} />
          </HardCard>
        )}
      </div>

      {ki.clusters && ki.clusters.length > 0 ? (
        <div>
          <p className="text-[10px] text-outline uppercase tracking-widest mb-3">Keyword Clusters</p>
          <div className="grid sm:grid-cols-2 gap-4">{ki.clusters.map(c => <KeywordClusterCard key={c.label} cluster={c} />)}</div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] text-outline uppercase tracking-widest">Keyword Buckets</p>
            {kiProv && <ProvenanceBadge p={kiProv} />}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><p className="text-[10px] text-ink-variant mb-2">Top Buying</p><ExpandableKeywordTable keywords={ki.top_buying} /></div>
            <div><p className="text-[10px] text-ink-variant mb-2">Opportunity</p><ExpandableKeywordTable keywords={ki.opportunity} /></div>
            <div><p className="text-[10px] text-ink-variant mb-2">Long-Tail</p><ExpandableKeywordTable keywords={ki.long_tail} /></div>
            <div><p className="text-[10px] text-ink-variant mb-2">Fast-Growing</p><ExpandableKeywordTable keywords={ki.fast_growing} /></div>
          </div>
        </div>
      )}

      {ki.opportunities && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] text-outline uppercase tracking-widest">Opportunity Discovery</p>
            <ProvenanceBadge p={keywordOpportunityScoreProvenance()} />
          </div>
          <KeywordOpportunityDiscoverySection opp={ki.opportunities} />
        </div>
      )}

      {topKeyword && (topKeyword.amazon_ppc_estimate || topKeyword.click_potential !== undefined) && (
        <HardCard>
          <p className="text-xs font-semibold text-black mb-3">Product Impact — &ldquo;{topKeyword.keyword}&rdquo;</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ProductImpactStat label="Est. Monthly Clicks" value={topKeyword.click_potential != null ? `${topKeyword.click_potential.toLocaleString()}/mo` : '—'} provenance={keywordClickConversionProvenance()} />
            <ProductImpactStat label="Est. Monthly Conversions" value={topKeyword.conversion_potential != null ? `${topKeyword.conversion_potential.toLocaleString()}/mo` : '—'} provenance={keywordClickConversionProvenance()} />
            <ProductImpactStat label="Google CPC" value={topKeyword.cpc != null ? `$${topKeyword.cpc.toFixed(2)}` : '—'} provenance={kiProv} />
            <ProductImpactStat label="Amazon PPC (est.)" value={topKeyword.amazon_ppc_estimate ? `$${topKeyword.amazon_ppc_estimate.low.toFixed(2)}–$${topKeyword.amazon_ppc_estimate.high.toFixed(2)}` : '—'} provenance={keywordAmazonPpcProvenance()} />
          </div>
          {topKeyword.search_intent && (
            <p className="text-[10px] text-outline mt-3">
              Search intent: <span className="text-ink-variant font-medium capitalize">{topKeyword.search_intent}</span>
              {keywordSearchIntentProvenance(topKeyword.search_intent_source) && (
                <span className="ml-2"><ProvenanceBadge p={keywordSearchIntentProvenance(topKeyword.search_intent_source)!} /></span>
              )}
            </p>
          )}
        </HardCard>
      )}

      {topKeyword && (topKeyword.serp_features?.length || topKeyword.avg_referring_domains != null || topKeyword.top_of_page_bid_range || topKeyword.competition_level) && (
        <HardCard>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-black">Search Visibility — &ldquo;{topKeyword.keyword}&rdquo;</p>
            {kiProv && <ProvenanceBadge p={kiProv} />}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <ProductImpactStat label="Competition" value={topKeyword.competition_level ?? '—'} provenance={kiProv} />
            <ProductImpactStat label="Top-of-Page Bid" value={topKeyword.top_of_page_bid_range ? `$${topKeyword.top_of_page_bid_range.low.toFixed(2)}–$${topKeyword.top_of_page_bid_range.high.toFixed(2)}` : '—'} provenance={kiProv} />
            <ProductImpactStat label="Competing Results" value={topKeyword.serp_results_count != null ? topKeyword.serp_results_count.toLocaleString() : '—'} provenance={kiProv} />
            <ProductImpactStat label="Avg. Referring Domains" value={topKeyword.avg_referring_domains != null ? topKeyword.avg_referring_domains.toLocaleString() : '—'} provenance={kiProv} />
          </div>
          {topKeyword.serp_features && topKeyword.serp_features.length > 0 && (
            <div>
              <p className="text-[10px] text-outline mb-1.5">SERP features currently shown for this query:</p>
              <div className="flex flex-wrap gap-1.5">
                {topKeyword.serp_features.map(f => (
                  <span key={f} className="text-[10px] text-ink-variant bg-surface-container border border-black px-2 py-0.5">{f.replace(/_/g, ' ')}</span>
                ))}
              </div>
            </div>
          )}
        </HardCard>
      )}

      <div>
        <p className="text-[10px] text-outline uppercase tracking-widest mb-3">AI Insights</p>
        {ki.ai_insights ? <KeywordAIInsightsPanel insights={ki.ai_insights} /> : <LabNoData label="No data available" />}
      </div>
    </div>
  )
}
