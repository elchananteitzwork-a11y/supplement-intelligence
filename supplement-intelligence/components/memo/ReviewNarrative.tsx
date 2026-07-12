// ═══════════════════════════════════════════════════════════════════════
// Customer Review Intelligence — AI-synthesized commentary over real
// review text (lib/review-narrative). New section (docs/
// BACKEND_STITCH_COMPATIBILITY_AUDIT.md §B): memo.review_narrative was
// already computed and persisted by app/api/generate/route.ts on every
// generation that clears the review-count threshold, but was never
// rendered anywhere. Zero backend change — purely surfacing an existing
// field.
//
// Architecture constraint (lib/review-narrative/types.ts): this object is
// never read by the Decision Engine — it is commentary only, and its
// mandatory `disclaimer` renders verbatim here so that distinction is
// never lost on the reader.
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData } from '@/types/index'
import type { RankedInsight } from '@/lib/review-engine'
import { ProvenanceCaption } from './shared'

function InsightList({ items, emptyLabel }: { items: RankedInsight[]; emptyLabel: string }) {
  if (!items.length) return <p className="text-xs text-outline italic py-2">{emptyLabel}</p>
  return (
    <ul className="space-y-2">
      {items.slice(0, 6).map((it, i) => (
        <li key={i} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-black font-medium">{it.insight}</span>
            <span className="text-[11px] font-mono text-outline shrink-0">{it.mention_count} mentions · {Math.round(it.frequency * 100)}%</span>
          </div>
          {it.severity && <span className="text-[10px] text-outline uppercase tracking-wide">{it.severity}</span>}
        </li>
      ))}
    </ul>
  )
}

export default function ReviewNarrative({ m }: { m: MemoData }) {
  const rn = m.review_narrative
  if (!rn) return null

  return (
    <div className="space-y-5">
      <ProvenanceCaption p={{ level: 'synthesized', source: 'Claude (AI synthesis)', detail: rn.disclaimer }} />

      <p className="text-[11px] text-outline">
        {rn.total_reviews_analyzed} real reviews analyzed · avg rating <span className="font-mono text-ink-variant">{rn.avg_rating}/5</span> · overall sentiment <span className="font-mono text-ink-variant">{rn.overall_sentiment}</span>
      </p>

      {rn.ai_recommendation && (
        <div className="bg-white border border-black p-4">
          <p className="text-xs font-semibold text-black mb-2">AI Recommendation</p>
          <p className="text-sm text-ink-variant leading-relaxed">{rn.ai_recommendation}</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-5">
        <div className="bg-white border border-black p-4">
          <p className="text-xs font-semibold text-black mb-3">Top Complaints</p>
          {rn.top_complaints.length
            ? <ul className="space-y-1.5">{rn.top_complaints.slice(0, 6).map((c, i) => <li key={i} className="text-sm text-ink-variant">&ldquo;{c}&rdquo;</li>)}</ul>
            : <p className="text-xs text-outline italic py-2">None surfaced in this review sample.</p>}
        </div>

        <div className="bg-white border border-black p-4">
          <p className="text-xs font-semibold text-black mb-3">Top Requested Features</p>
          {rn.top_requested_features.length
            ? <ul className="space-y-1.5">{rn.top_requested_features.slice(0, 6).map((f, i) => <li key={i} className="text-sm text-ink-variant">&ldquo;{f}&rdquo;</li>)}</ul>
            : <p className="text-xs text-outline italic py-2">None surfaced in this review sample.</p>}
        </div>

        <div className="bg-white border border-black p-4">
          <p className="text-xs font-semibold text-black mb-3">Pain Points</p>
          <InsightList items={rn.pain_points} emptyLabel="No recurring pain points met the ranking threshold." />
        </div>

        <div className="bg-white border border-black p-4">
          <p className="text-xs font-semibold text-black mb-3">Missing Features</p>
          <InsightList items={rn.missing_features} emptyLabel="No recurring feature gaps met the ranking threshold." />
        </div>

        <div className="bg-white border border-black p-4 sm:col-span-2">
          <p className="text-xs font-semibold text-black mb-3">Positive Themes</p>
          <InsightList items={rn.positive_themes} emptyLabel="No recurring positive themes met the ranking threshold." />
        </div>
      </div>
    </div>
  )
}
