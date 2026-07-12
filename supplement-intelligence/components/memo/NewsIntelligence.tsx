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

const NEWS_CATEGORY_CLS: Record<string, string> = {
  'FDA Recall':              'text-verdict-negative bg-white border-black',
  'Adverse Event Signal':    'text-orange-600 bg-orange-50 border-orange-200',
  'Regulatory Change':       'text-verdict-caution-text bg-white border-black',
  'Acquisition':             'text-violet-600 bg-violet-50 border-violet-200',
  'Funding Round':           'text-verdict-positive bg-white border-black',
  'Competitor Announcement': 'text-black bg-white border-black',
  'Product Launch':          'text-black bg-white border-black',
  'Scientific Study':        'text-ink-variant bg-surface-container border-black',
  'Industry News':           'text-ink-variant bg-surface-container-low border-black',
}

const TRAJECTORY_CLS: Record<string, string> = {
  Accelerating: 'text-verdict-positive bg-white border-black',
  Stable:       'text-ink-variant bg-surface-container border-black',
  Slowing:      'text-verdict-caution-text bg-white border-black',
  Unknown:      'text-outline bg-surface-container-low border-outline-variant',
}

function NewsItemCard({ item }: { item: NewsItem }) {
  const dateStr = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block bg-white border border-black p-4 hover:bg-surface-container-low transition-colors">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wide border px-2 py-0.5 ${NEWS_CATEGORY_CLS[item.category] ?? NEWS_CATEGORY_CLS['Industry News']}`}>
          {item.category}
        </span>
        <span className="text-[10px] text-outline font-mono shrink-0">{dateStr}</span>
      </div>
      <p className="text-sm text-black leading-snug mb-1.5">{item.headline}</p>
      {(item.recall_classification || item.recall_status) && (
        <p className="text-[11px] mb-1.5 flex items-center gap-2 flex-wrap">
          {item.recall_classification && (
            <span className={`font-semibold ${
              item.recall_classification === 'Class I'  ? 'text-verdict-negative' :
              item.recall_classification === 'Class II' ? 'text-verdict-caution-text' :
              item.recall_classification === 'Class III' ? 'text-ink-variant' : 'text-outline'
            }`}>
              {item.recall_classification}
            </span>
          )}
          {item.recall_status && <span className="text-outline">{item.recall_status}</span>}
        </p>
      )}
      {item.study_type && (
        <p className="text-[11px] mb-1.5"><span className="font-semibold text-verdict-caution-text">{item.study_type}</span></p>
      )}
      {item.adverse_event_reactions && item.adverse_event_reactions.length > 0 && (
        <p className="text-[11px] text-verdict-caution-text mb-1.5">Reported reactions: {item.adverse_event_reactions.slice(0, 4).join(', ')}</p>
      )}
      <p className="text-[11px] text-outline mb-2">{item.source} · {Math.round(item.confidence * 100)}% relevance match</p>
      {item.why_it_matters && <p className="text-[11px] text-outline leading-relaxed border-t border-black pt-2 mt-2">{item.why_it_matters}</p>}
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
        <p className="text-sm font-mono text-outline italic py-3">No data available</p>
      ) : (
        <div className="space-y-6 mt-3">
          <p className="text-[11px] text-outline">
            Window: last {ni.windowDays} days · Sources: {ni.providersUsed.length ? ni.providersUsed.join(', ') : 'none returned results'}
          </p>

          {ni.sentiment && (
            <div className="flex items-center justify-between gap-3 bg-surface-container-low border border-black px-3.5 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] text-outline uppercase tracking-wider">Real News Sentiment</span>
                <span className={`text-sm font-mono font-semibold ${ni.sentiment.avg_tone <= -3 ? 'text-verdict-negative' : ni.sentiment.avg_tone >= 1 ? 'text-verdict-positive' : 'text-ink-variant'}`}>
                  {ni.sentiment.avg_tone > 0 ? '+' : ''}{ni.sentiment.avg_tone}
                </span>
                <span className="text-[11px] text-outline">across {ni.sentiment.sample_size} real articles</span>
              </div>
              <ProvenanceBadge p={newsSentimentProvenance(ni)!} />
            </div>
          )}

          <div className="bg-white border border-black p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-black">What Changed</p>
              <span className={`text-[10px] font-semibold uppercase tracking-wide border px-2 py-0.5 ${TRAJECTORY_CLS[ni.summary.trajectory]}`}>{ni.summary.trajectory}</span>
            </div>
            <p className="text-[12px] text-ink-variant leading-relaxed">{ni.summary.what_changed}</p>
            {(ni.summary.new_risks.length > 0 || ni.summary.new_opportunities.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                {ni.summary.new_risks.length > 0 && (
                  <div>
                    <p className="text-[10px] text-outline uppercase tracking-wide mb-1.5">New Risks</p>
                    <ul className="space-y-1">{ni.summary.new_risks.map((r, i) => <li key={i} className="text-[11px] text-outline">• {r}</li>)}</ul>
                  </div>
                )}
                {ni.summary.new_opportunities.length > 0 && (
                  <div>
                    <p className="text-[10px] text-outline uppercase tracking-wide mb-1.5">New Opportunities</p>
                    <ul className="space-y-1">{ni.summary.new_opportunities.map((o, i) => <li key={i} className="text-[11px] text-outline">• {o}</li>)}</ul>
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
