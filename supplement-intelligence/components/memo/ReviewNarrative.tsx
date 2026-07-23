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
import { ProvenanceCaption, PiCard } from './shared'

function InsightList({ items, emptyLabel }: { items: RankedInsight[]; emptyLabel: string }) {
  if (!items.length) return <p className="text-xs text-pi-faint italic py-2">{emptyLabel}</p>
  return (
    <ul className="space-y-2">
      {items.slice(0, 6).map((it, i) => (
        <li key={i} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-pi-ink font-medium">{it.insight}</span>
            <span className="text-[11px] font-mono text-pi-faint shrink-0">{it.mention_count} mentions · {Math.round(it.frequency * 100)}%</span>
          </div>
          {it.severity && <span className="text-[10px] text-pi-faint uppercase tracking-wide">{it.severity}</span>}
        </li>
      ))}
    </ul>
  )
}

export default function ReviewNarrative({ m }: { m: MemoData }) {
  const rn = m.review_narrative
  // Real gap found in the pre-beta walkthrough (2026-07-21): this used to
  // return null here, but the ReportSection wrapper that renders this
  // component (components/memo/MemoDisplay.tsx) always renders its own
  // card + title regardless of children — so a null review_narrative (most
  // often because the review-collection provider didn't return enough real
  // reviews, not because there's nothing to say) showed as an empty box
  // with no content and no explanation. Same distinction this file already
  // draws for other absent fields: state honestly that the data wasn't
  // available, not that there's nothing here.
  if (!rn) {
    return (
      <p className="text-sm text-pi-faint italic py-2">
        Customer review data wasn't available for this analysis — the review-collection provider didn't return enough real reviews to synthesize from.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <ProvenanceCaption p={{ level: 'synthesized', source: 'Claude (AI synthesis)', detail: rn.disclaimer }} />

      <p className="text-[11px] text-pi-faint">
        {rn.total_reviews_analyzed} real reviews analyzed · avg rating <span className="font-mono text-pi-sub">{rn.avg_rating}/5</span> · overall sentiment <span className="font-mono text-pi-sub">{rn.overall_sentiment}</span>
      </p>

      {rn.ai_recommendation && (
        <PiCard>
          <p className="text-xs font-semibold text-pi-ink mb-2">AI Recommendation</p>
          <p className="text-sm text-pi-sub leading-relaxed">{rn.ai_recommendation}</p>
        </PiCard>
      )}

      <div className="grid sm:grid-cols-2 gap-5">
        <PiCard>
          <p className="text-xs font-semibold text-pi-ink mb-3">Top Complaints</p>
          {rn.top_complaints.length
            ? <ul className="space-y-1.5">{rn.top_complaints.slice(0, 6).map((c, i) => <li key={i} className="text-sm text-pi-sub">&ldquo;{c}&rdquo;</li>)}</ul>
            : <p className="text-xs text-pi-faint italic py-2">None surfaced in this review sample.</p>}
        </PiCard>

        <PiCard>
          <p className="text-xs font-semibold text-pi-ink mb-3">Top Requested Features</p>
          {rn.top_requested_features.length
            ? <ul className="space-y-1.5">{rn.top_requested_features.slice(0, 6).map((f, i) => <li key={i} className="text-sm text-pi-sub">&ldquo;{f}&rdquo;</li>)}</ul>
            : <p className="text-xs text-pi-faint italic py-2">None surfaced in this review sample.</p>}
        </PiCard>

        <PiCard>
          <p className="text-xs font-semibold text-pi-ink mb-3">Pain Points</p>
          <InsightList items={rn.pain_points} emptyLabel="No recurring pain points met the ranking threshold." />
        </PiCard>

        <PiCard>
          <p className="text-xs font-semibold text-pi-ink mb-3">Missing Features</p>
          <InsightList items={rn.missing_features} emptyLabel="No recurring feature gaps met the ranking threshold." />
        </PiCard>

        <PiCard className="sm:col-span-2">
          <p className="text-xs font-semibold text-pi-ink mb-3">Positive Themes</p>
          <InsightList items={rn.positive_themes} emptyLabel="No recurring positive themes met the ranking threshold." />
        </PiCard>
      </div>
    </div>
  )
}
