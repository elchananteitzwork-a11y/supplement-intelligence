// ═══════════════════════════════════════════════════════════════════════
// Strategic Readiness — validation budget/success metrics/kill criteria
// (moved out of the old InvestmentThesisSection) fused with the old
// RiskAssessmentContent tab (severity-sorted weak dimensions + real FDA
// recall + real negative news sentiment). Matches the Stitch "Investor
// Report" reference's Strategic Readiness section + black Kill Criteria
// panel at the end of the report.
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData, BuildDecision } from '@/types/index'
import { computeGroundedScore } from '@/lib/scoring'
import { newsIntelligenceProvenance, newsSentimentProvenance, type Provenance } from '@/lib/provenance'
import { HardCard } from '@/components/ui'
import { IconArrowRight, IconAlert } from '@/components/icons'
import {
  ProvenanceBadge, LabEmptyState, EvidenceBadge,
  deriveValidationBudget, deriveSuccessMetrics,
} from './shared'

const DIM_LABELS: Record<string, string> = {
  demand: 'Demand', virality: 'Virality', subscription: 'Subscription',
  manufacturing: 'Manufacturing', competition: 'Market Accessibility',
}

function RiskAssessment({ m }: { m: MemoData }) {
  const resolvedDims = computeGroundedScore(m).dimensions
    .filter(d => (['demand', 'virality', 'subscription', 'manufacturing'] as const).includes(d.key as never))
  const weak = resolvedDims
    .map(d => ({
      key:      d.key,
      notes:    m.scores[d.key as 'demand' | 'virality' | 'subscription' | 'manufacturing']?.notes ?? '',
      isWeak:   d.rawScore !== undefined ? d.rawScore <= 5 : d.qualitativeLevel === 'Low',
      severity: d.rawScore !== undefined ? (d.rawScore <= 3 ? 'High' as const : 'Medium' as const) : 'Medium' as const,
      display:  d.rawScore !== undefined ? `${d.rawScore}/10` : (d.qualitativeLevel ?? 'Low'),
      provenance: { level: d.source, source: d.sourceLabel, detail: d.sourceLabel } as Provenance,
    }))
    .filter(d => d.isWeak && d.notes)
    .sort((a, b) => (a.severity === 'High' ? 0 : 1) - (b.severity === 'High' ? 0 : 1))

  const recall = m.news_intelligence?.items.find(it => it.category === 'FDA Recall')
  const sentiment = m.news_intelligence?.sentiment
  const sentimentIsNegative = sentiment !== undefined && sentiment !== null && sentiment.avg_tone <= -3

  if (weak.length === 0 && !recall && !sentimentIsNegative) return (
    <LabEmptyState
      icon={<IconAlert className="w-5 h-5" />}
      title="No dimension scored below 6"
      description="Overall risk profile is moderate — primary risk is execution, not market structure."
    />
  )

  return (
    <div className="space-y-3">
      {sentimentIsNegative && sentiment && (
        <div className="border border-black border-l-[3px] border-l-verdict-caution-text px-4 py-3.5">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-verdict-caution-text">Real Negative News Sentiment</p>
            <ProvenanceBadge p={newsSentimentProvenance(m.news_intelligence)!} />
          </div>
          <p className="text-sm text-ink-variant leading-relaxed">
            Real GDELT coverage of this category skews negative (avg tone <span className="font-mono">{sentiment.avg_tone}</span> across {sentiment.sample_size} real articles) — worth reading the actual headlines in the News Intelligence section before committing capital.
          </p>
        </div>
      )}
      {recall && (
        <div className={`border border-black border-l-[3px] px-4 py-3.5 ${recall.recall_classification === 'Class I' ? 'border-l-verdict-negative' : 'border-l-verdict-caution-text'}`}>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${recall.recall_classification === 'Class I' ? 'text-verdict-negative' : 'text-verdict-caution-text'}`}>
              Real FDA Recall{recall.recall_classification && recall.recall_classification !== 'Not Yet Classified' ? ` — ${recall.recall_classification}` : ''}
            </p>
            <ProvenanceBadge p={newsIntelligenceProvenance(m.news_intelligence)!} />
          </div>
          <p className="text-sm text-ink-variant leading-relaxed">{recall.headline}</p>
          {recall.recall_status && <p className="text-[11px] text-outline mt-1">Status: {recall.recall_status}</p>}
        </div>
      )}
      {weak.length > 0 && (
        <HardCard padded={false} className="divide-y divide-black overflow-hidden">
          {weak.map(d => (
            <div key={d.key} className="flex gap-3 px-4 py-3.5">
              <span className={`font-mono font-bold text-base shrink-0 w-10 ${d.severity === 'High' ? 'text-verdict-negative' : 'text-verdict-caution-text'}`}>{d.display}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${d.severity === 'High' ? 'text-verdict-negative' : 'text-verdict-caution-text'}`}>
                    {DIM_LABELS[d.key] ?? d.key}
                  </p>
                  <EvidenceBadge type={d.provenance.level} source={d.provenance.source} detail={d.provenance.detail} />
                </div>
                <p className="text-sm text-ink-variant leading-relaxed">{d.notes}</p>
              </div>
            </div>
          ))}
        </HardCard>
      )}
    </div>
  )
}

// Kill Criteria moved out to its own top-level Stitch-mapped section
// (rendered directly in MemoDisplay.tsx via deriveKillCriteria +
// KillCriteriaList) — Stitch's Investor Report treats "Strategic
// Readiness" and "Kill Criteria" as two distinct sections (a bordered
// white card vs. a full-bleed black panel), not one bundled component.
export default function StrategicReadinessChecklist({ m, decision }: { m: MemoData; decision: BuildDecision }) {
  const budget  = deriveValidationBudget(m, decision)
  const metrics = deriveSuccessMetrics(m)
  // Relocated from the old FirstScreenSummary.tsx hero card — a primary
  // risk statement belongs with the rest of this report's risk content,
  // not bundled into the verdict display at the top of the report.
  const riskSentence = m.writer_output?.risk_sentence

  return (
    <HardCard className="animate-in">
      {riskSentence && (
        <div className="mb-6 border border-black border-l-[3px] border-l-verdict-negative px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-verdict-negative mb-1.5">Primary Risk</p>
          <p className="text-sm text-ink leading-relaxed">{riskSentence}</p>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <div className="bg-surface-container p-4">
          <p className="text-[10px] text-outline uppercase tracking-wider mb-2">Estimated Validation Budget</p>
          <p className="font-mono font-bold text-lg text-black mb-1">{budget.range}</p>
          <p className="text-[11px] text-outline leading-snug">{budget.breakdown}</p>
        </div>
        <div className="bg-surface-container p-4">
          <p className="text-[10px] text-outline uppercase tracking-wider mb-2">Success Metrics</p>
          <ul className="space-y-1.5">
            {metrics.map((mt, i) => (
              <li key={i} className="flex gap-2 text-xs text-ink-variant leading-snug">
                <IconArrowRight className="w-3.5 h-3.5 text-black shrink-0 mt-0.5" />{mt}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="pt-6 border-t border-black">
        <p className="text-[10px] text-outline uppercase tracking-widest mb-3">Risk Assessment</p>
        <p className="text-xs text-outline italic mb-4 leading-relaxed">Dimensions where market structure works against you — each is a thesis-breaking risk if not addressed at launch.</p>
        <RiskAssessment m={m} />
      </div>
    </HardCard>
  )
}
