// ═══════════════════════════════════════════════════════════════════════
// Recent Market Intelligence — real news items (openFDA/PubMed/GDELT),
// never the LLM. Only the per-item caption and summary block are
// AI-written, as an explanation of items already fetched. Direct
// successor to NewsIntelligenceSection in the old components/MemoDisplay.tsx.
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData } from '@/types/index'
import type { NewsItem } from '@/lib/news-engine/types'
import { newsIntelligenceProvenance, newsSentimentProvenance } from '@/lib/provenance'
import { ProvenanceBadge } from './shared'

// pi-* palette only (Acquisition/Adverse Event previously used raw
// Tailwind violet-*/orange-* — not part of the pi-* system, remapped onto
// the closest semantic pi tone: pi-invest for informational/financial
// items, pi-gold for a softer caution than a confirmed FDA Recall's pi-risk).
const NEWS_CATEGORY_CLS: Record<string, string> = {
  'FDA Recall':              'text-pi-risk-noir bg-pi-risk-noir/10 border-pi-risk-noir/30',
  'Adverse Event Signal':    'text-pi-gold-deep bg-pi-gold-deep/10 border-pi-gold-deep/30',
  'Regulatory Change':       'text-pi-gold-deep bg-pi-gold-deep/10 border-pi-gold-deep/30',
  'Acquisition':             'text-pi-invest-noir bg-pi-invest-noir/10 border-pi-invest-noir/30',
  'Funding Round':           'text-pi-build-noir bg-pi-build-noir/10 border-pi-build-noir/30',
  'Competitor Announcement': 'text-pi-noir-text bg-pi-elevated border-pi-noir-hairline',
  'Product Launch':          'text-pi-noir-text bg-pi-elevated border-pi-noir-hairline',
  'Scientific Study':        'text-pi-noir-sub bg-pi-elevated border-pi-noir-hairline',
  'Industry News':           'text-pi-noir-sub bg-pi-elevated border-pi-noir-hairline',
}

const TRAJECTORY_CLS: Record<string, string> = {
  Accelerating: 'text-pi-build-noir bg-pi-build-noir/10 border-pi-build-noir/30',
  Stable:       'text-pi-noir-sub bg-pi-elevated border-pi-noir-hairline',
  Slowing:      'text-pi-gold-deep bg-pi-gold-deep/10 border-pi-gold-deep/30',
  Unknown:      'text-pi-noir-sub bg-pi-elevated border-pi-noir-hairline',
}

function NewsItemCard({ item }: { item: NewsItem }) {
  const dateStr = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-pi-noir-hairline bg-pi-elevated p-4 hover:bg-pi-elevated/40 transition-colors">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 ${NEWS_CATEGORY_CLS[item.category] ?? NEWS_CATEGORY_CLS['Industry News']}`}>
          {item.category}
        </span>
        <span className="text-[10px] text-pi-noir-sub font-mono shrink-0">{dateStr}</span>
      </div>
      <p className="text-sm text-pi-noir-text leading-snug mb-1.5">{item.headline}</p>
      {(item.recall_classification || item.recall_status) && (
        <p className="text-[11px] mb-1.5 flex items-center gap-2 flex-wrap">
          {item.recall_classification && (
            <span className={`font-semibold ${
              item.recall_classification === 'Class I'  ? 'text-pi-risk-noir' :
              item.recall_classification === 'Class II' ? 'text-pi-gold-bright' :
              item.recall_classification === 'Class III' ? 'text-pi-noir-sub' : 'text-pi-noir-sub'
            }`}>
              {item.recall_classification}
            </span>
          )}
          {item.recall_status && <span className="text-pi-noir-sub">{item.recall_status}</span>}
        </p>
      )}
      {item.study_type && (
        <p className="text-[11px] mb-1.5"><span className="font-semibold text-pi-gold-bright">{item.study_type}</span></p>
      )}
      {item.adverse_event_reactions && item.adverse_event_reactions.length > 0 && (
        <p className="text-[11px] text-pi-gold-bright mb-1.5">Reported reactions: {item.adverse_event_reactions.slice(0, 4).join(', ')}</p>
      )}
      <p className="text-[11px] text-pi-noir-sub mb-2">{item.source} · {Math.round(item.confidence * 100)}% relevance match</p>
      {item.why_it_matters && <p className="text-[11px] text-pi-noir-sub leading-relaxed border-t border-pi-noir-hairline pt-2 mt-2">{item.why_it_matters}</p>}
    </a>
  )
}

export default function NewsIntelligence({ m }: { m: MemoData }) {
  const ni = m.news_intelligence
  const provenance = newsIntelligenceProvenance(ni)

  return (
    <div>
      <div className="flex items-center justify-end gap-3 mb-1">
        {provenance && <ProvenanceBadge p={provenance} />}
      </div>

      {!ni ? (
        <p className="text-sm font-mono text-pi-noir-sub italic py-3">No data available</p>
      ) : (
        <div className="space-y-6 mt-3">
          <p className="text-[11px] text-pi-noir-sub">
            Window: last {ni.windowDays} days · Sources: {ni.providersUsed.length ? ni.providersUsed.join(', ') : 'none returned results'}
          </p>

          {ni.sentiment && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-pi-elevated border border-pi-noir-hairline px-3.5 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] text-pi-noir-sub uppercase tracking-wider">Real News Sentiment</span>
                <span className={`text-sm font-mono font-semibold ${ni.sentiment.avg_tone <= -3 ? 'text-pi-risk-noir' : ni.sentiment.avg_tone >= 1 ? 'text-pi-build-noir' : 'text-pi-noir-sub'}`}>
                  {ni.sentiment.avg_tone > 0 ? '+' : ''}{ni.sentiment.avg_tone}
                </span>
                <span className="text-[11px] text-pi-noir-sub">across {ni.sentiment.sample_size} real articles</span>
              </div>
              <ProvenanceBadge p={newsSentimentProvenance(ni)!} />
            </div>
          )}

          <div className="rounded-xl border border-pi-noir-hairline bg-pi-elevated p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-pi-noir-text">What Changed</p>
              <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 ${TRAJECTORY_CLS[ni.summary.trajectory]}`}>{ni.summary.trajectory}</span>
            </div>
            <p className="text-[12px] text-pi-noir-sub leading-relaxed">{ni.summary.what_changed}</p>
            {(ni.summary.new_risks.length > 0 || ni.summary.new_opportunities.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                {ni.summary.new_risks.length > 0 && (
                  <div>
                    <p className="text-[10px] text-pi-noir-sub uppercase tracking-wide mb-1.5">New Risks</p>
                    <ul className="space-y-1">{ni.summary.new_risks.map((r, i) => <li key={i} className="text-[11px] text-pi-noir-sub">• {r}</li>)}</ul>
                  </div>
                )}
                {ni.summary.new_opportunities.length > 0 && (
                  <div>
                    <p className="text-[10px] text-pi-noir-sub uppercase tracking-wide mb-1.5">New Opportunities</p>
                    <ul className="space-y-1">{ni.summary.new_opportunities.map((o, i) => <li key={i} className="text-[11px] text-pi-noir-sub">• {o}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {ni.items.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-4">{ni.items.map(item => <NewsItemCard key={item.id} item={item} />)}</div>
          )}
        </div>
      )}
    </div>
  )
}
