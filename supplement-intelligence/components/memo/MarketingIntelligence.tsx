// ═══════════════════════════════════════════════════════════════════════
// Marketing Intelligence — Roadmap M1.5. Real Meta Ad Library data only:
// active ad count, distinct advertiser count, active-ad share, ad start/
// stop date range, and creative longevity (avg age of still-running ads,
// avg total lifespan of concluded ads — kept separate, never blended, see
// lib/signal-engine/providers/meta-ads.ts's header comment for why).
//
// `m.signal_evidence.virality` is a composite dimension tiktok/reddit/
// meta-ads can all populate — this component only ever reads it when
// metaAdsProvenance confirms 'meta-ads' is actually in `virality.sources`
// for this exact query, so a query where only tiktok/reddit fired renders
// the "not available" empty state below rather than showing Meta Ad
// Library attribution it never earned. No estimate is ever generated when
// the provider has no data.
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData } from '@/types/index'
import { metaAdsProvenance } from '@/lib/provenance'
import { IconTarget } from '@/components/icons'
import { ProvenanceBadge, LabEmptyState } from './shared'

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-pi-elevated p-4">
      <p className="font-mono text-[10px] text-pi-noir-sub uppercase tracking-wider">{label}</p>
      <p className="font-bold text-2xl text-pi-noir-text leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-pi-noir-sub mt-0.5">{sub}</p>}
    </div>
  )
}

const META_SIGNAL_CLS: Record<'High' | 'Medium' | 'Low', string> = {
  High:   'text-pi-build-noir border-pi-build-noir/30 bg-pi-build-noir/10',
  Medium: 'text-pi-gold-deep border-pi-gold-deep/30 bg-pi-gold-deep/10',
  Low:    'text-pi-noir-sub border-pi-noir-hairline bg-pi-elevated',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export default function MarketingIntelligence({ m }: { m: MemoData }) {
  const provenance = metaAdsProvenance(m.signal_evidence)
  const v = m.signal_evidence?.virality?.value

  if (!provenance || !v) {
    return (
      <LabEmptyState
        icon={<IconTarget className="w-5 h-5" />}
        title="Not available from this provider"
        description="Meta Ad Library data was not available for this query — either the provider is not configured for this deployment, or too few matching ads were found to trust as a category signal (fewer than 3). No estimate is shown in its place."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-pi-noir-sub italic leading-relaxed">Real paid-media activity for this category, from the Meta Ad Library public archive — sustained ad spend is a revealed economic preference, independent of Amazon/search/organic-social evidence.</p>
        <ProvenanceBadge p={provenance} />
      </div>

      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg border border-pi-noir-hairline shrink-0 grid place-items-center">
          {v.meta_signal && <span className={`w-2 h-2 rounded-full ${v.meta_signal === 'High' ? 'bg-pi-build-noir' : v.meta_signal === 'Medium' ? 'bg-pi-gold-bright' : 'bg-pi-noir-sub'}`} />}
        </div>
        <div>
          <p className="text-[10px] text-pi-noir-sub uppercase tracking-wider mb-1">Marketing Intensity</p>
          {v.meta_signal && (
            <span className={`inline-flex items-center text-xs font-semibold rounded-full border px-2.5 py-1 ${META_SIGNAL_CLS[v.meta_signal]}`}>{v.meta_signal}</span>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {v.ad_count !== undefined && (
          <StatTile label="Active Ads Found" value={String(v.ad_count)} sub={v.ad_count >= 100 ? 'page cap reached — true total is ≥ this' : undefined} />
        )}
        {v.advertiser_count !== undefined && (
          <StatTile label="Distinct Advertisers" value={String(v.advertiser_count)} />
        )}
        {v.active_ad_pct !== undefined && (
          <StatTile label="Still Actively Delivering" value={`${Math.round(v.active_ad_pct * 100)}%`} />
        )}
      </div>

      {(v.earliest_ad_start || v.latest_ad_start || v.recent_ad_start_pct !== undefined) && (
        <div className="pt-5 border-t border-pi-noir-hairline">
          <p className="text-[10px] text-pi-noir-sub uppercase tracking-widest mb-3">Ad Start Dates</p>
          <div className="rounded-lg border border-pi-noir-hairline divide-y divide-pi-noir-hairline overflow-hidden">
            {v.earliest_ad_start && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-xs text-pi-noir-sub">Earliest ad found</span>
                <span className="font-mono text-sm font-semibold text-pi-noir-text">{fmtDate(v.earliest_ad_start)}</span>
              </div>
            )}
            {v.latest_ad_start && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-xs text-pi-noir-sub">Most recent ad found</span>
                <span className="font-mono text-sm font-semibold text-pi-noir-text">{fmtDate(v.latest_ad_start)}</span>
              </div>
            )}
            {v.recent_ad_start_pct !== undefined && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-xs text-pi-noir-sub">Started in the last 90 days</span>
                <span className="font-mono text-sm font-semibold text-pi-noir-text">{Math.round(v.recent_ad_start_pct * 100)}%</span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-pi-noir-sub italic mt-2 leading-relaxed">
            &ldquo;Started in the last 90 days&rdquo; is a single-snapshot proxy for a 90-day trend, not a true count-over-time delta — this provider makes one point-in-time request per analysis.
          </p>
        </div>
      )}

      {(v.avg_active_ad_age_days !== undefined || v.avg_concluded_ad_duration_days !== undefined) && (
        <div className="pt-5 border-t border-pi-noir-hairline">
          <p className="text-[10px] text-pi-noir-sub uppercase tracking-widest mb-3">Creative Longevity</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {v.avg_active_ad_age_days !== undefined && (
              <StatTile label="Avg. Age — Still Running" value={`${v.avg_active_ad_age_days}d`} sub="Real elapsed time for ads that have not stopped — not their total lifespan." />
            )}
            {v.avg_concluded_ad_duration_days !== undefined && (
              <StatTile label="Avg. Lifespan — Concluded" value={`${v.avg_concluded_ad_duration_days}d`} sub="Real total run time for ads that have already stopped delivering." />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
