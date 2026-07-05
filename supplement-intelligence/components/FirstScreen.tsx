'use client'

import { useState } from 'react'
import type { MemoData } from '@/types/index'
import type { ConfidenceTier } from '@/lib/ai-interpretation/types'
import {
  verdictLabelFromDecision,
  verdictDisplayText,
  buildConfidenceQualifier,
  computeVerdictConfidence,
} from '@/lib/ai-interpretation/verdict'
import { computeGroundedScore } from '@/lib/scoring'
import { LabCard, LabGlass } from '@/components/lab/Surfaces'

// §5.1 display labels — same order as the spec table
const SIGNAL_LABELS: Record<string, string> = {
  demand:                    'Demand',
  market_accessibility:      'Market Accessibility',
  profitability:             'Profit Potential',
  consumer_pain:             'Consumer Pain',
  virality:                  'Viral Potential',
  subscription_potential:    'Subscription Potential',
  manufacturing_feasibility: 'Manufacturing Feasibility',
}

// §10.4 — badge visual config. ConfidenceTier = HIGH/MODERATE/LOW
// maps to spec CONFIRMED/INDICATED/LIMITED display.
const CONFIDENCE_CFG: Record<ConfidenceTier, {
  label:   string
  classes: string
  dot:     string
  tooltip: string
}> = {
  HIGH: {
    label:   'Confirmed',
    classes: 'text-lab-verdant bg-lab-verdant/10 border-lab-verdant/30',
    dot:     'bg-lab-verdant',
    tooltip: 'Multiple independent data sources agree.',
  },
  MODERATE: {
    label:   'Indicated',
    classes: 'text-lab-amber bg-lab-amber/10 border-lab-amber/30',
    dot:     'bg-lab-amber',
    tooltip: 'Based on a single data source. Reasonable estimate, not confirmed.',
  },
  LOW: {
    label:   'Limited',
    classes: 'text-lab-ember bg-lab-ember/10 border-lab-ember/30',
    dot:     'bg-lab-ember',
    tooltip: 'Insufficient data to confirm this signal. Treat with caution.',
  },
}

type ExpandableCardData = NonNullable<MemoData['expandable_cards']>[string]

// §7.3 — a single signal card with inline expansion (AT-DISC-001, AT-DISC-002)
function SignalCard({
  id, card, expanded, onToggle,
}: {
  id: string
  card: ExpandableCardData
  expanded: boolean
  onToggle: () => void
}) {
  const cfg = CONFIDENCE_CFG[card.confidence]
  const label = SIGNAL_LABELS[id] ?? id
  const headline = card.interpretation.split(/\s+/).slice(0, 8).join(' ')
  const supportingStat = card.data_points[0]
    ? `${card.data_points[0].label}: ${card.data_points[0].value}`
    : '—'

  return (
    <div className="rounded-lab-md border border-lab-border-soft bg-lab-void-2 overflow-hidden">
      {/* Card header — always visible */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3.5 flex items-start justify-between gap-3 hover:bg-white/[0.02] transition-colors duration-lab-fast"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[12px] font-semibold text-lab-text-primary">{label}</span>
            <span
              className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest border rounded-full px-1.5 py-0.5 shrink-0 ${cfg.classes}`}
              title={cfg.tooltip}
            >
              <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-lab-text-secondary leading-snug truncate">{headline}</p>
          <p className="lab-text-data text-[10px] text-lab-text-tertiary mt-1 truncate">{supportingStat}</p>
        </div>
        <span className={`text-lab-text-tertiary text-xs shrink-0 mt-0.5 transition-transform duration-lab-fast ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Layer 2 expansion — §9.2 */}
      {expanded && (
        <div className="border-t border-lab-border-faint px-4 py-4 bg-white/[0.015]">
          <p className="text-[11px] font-semibold text-lab-text-primary mb-1">
            {label} — {cfg.label}
          </p>
          <p className="text-[11px] text-lab-text-secondary mb-3 leading-relaxed">
            {cfg.tooltip}
          </p>

          {/* Data points */}
          <div className="space-y-1.5 mb-3">
            {card.data_points.map((pt, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-lab-text-tertiary shrink-0">{pt.label}</span>
                <span className="lab-text-data text-[11px] text-lab-text-secondary text-right">{pt.value}</span>
              </div>
            ))}
          </div>

          {/* Interpretation */}
          <p className="text-[11px] text-lab-text-secondary leading-relaxed italic border-t border-lab-border-faint pt-2.5">
            {card.interpretation}
          </p>

          {/* Limitation note — shown for LIMITED (LOW) and INDICATED (MODERATE) */}
          {card.limitation && (
            <p className="text-[10px] text-lab-ember/80 mt-2 leading-relaxed">
              ⚠ {card.limitation}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// §7.4 — primary risk with inline expansion
function RiskBlock({ riskSentence, isFallback }: { riskSentence: string; isFallback: boolean }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lab-md border border-lab-ember/25 bg-lab-ember/[0.04] overflow-hidden">
      <div className="px-4 py-3.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-lab-ember mb-2">
          Primary Risk
        </p>
        <p className="text-sm text-lab-text-primary leading-relaxed">
          {riskSentence}
        </p>
        {isFallback && (
          <p className="text-[10px] text-lab-text-tertiary mt-1">Template-generated</p>
        )}
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 border-t border-lab-ember/15 text-left text-[11px] text-lab-ember/70 hover:text-lab-ember transition-colors duration-lab-fast flex items-center justify-between"
      >
        <span>See what would change this</span>
        <span className={`transition-transform duration-lab-fast ${expanded ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {expanded && (
        <div className="px-4 py-3.5 border-t border-lab-ember/15 bg-white/[0.015]">
          <p className="text-[11px] text-lab-text-secondary leading-relaxed">
            This risk is based on the specific evidence values cited above. Collecting
            additional market data — particularly customer reviews and competitor
            positioning information — may reduce or reclassify this risk over time.
            Validate the specific condition mentioned before committing capital.
          </p>
        </div>
      )}
    </div>
  )
}

// §7.5 — product thesis headline with expansion to full thesis
function ThesisBlock({
  headline, fullThesis, isFallback,
}: {
  headline: string
  fullThesis: string
  isFallback: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lab-md border border-lab-photon/20 bg-lab-photon/[0.03] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3.5 flex items-start justify-between gap-3 hover:bg-white/[0.02] transition-colors duration-lab-fast"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-lab-photon mb-1.5">
            Product Thesis
          </p>
          <p className="text-sm font-medium text-lab-text-primary leading-snug">
            {headline}
          </p>
          {isFallback && (
            <p className="text-[10px] text-lab-text-tertiary mt-1">Template-generated</p>
          )}
        </div>
        <span className={`text-lab-text-tertiary text-xs shrink-0 mt-4 transition-transform duration-lab-fast ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {expanded && (
        <div className="border-t border-lab-photon/15 px-4 py-4 bg-white/[0.015]">
          <p className="text-sm text-lab-text-secondary leading-relaxed">{fullThesis}</p>
        </div>
      )}
    </div>
  )
}

// §10.3 — verdict confidence display
const VERDICT_CONF_CFG: Record<ConfidenceTier, { label: string; classes: string }> = {
  HIGH:     { label: 'High confidence',     classes: 'text-lab-verdant bg-lab-verdant/8 border-lab-verdant/25' },
  MODERATE: { label: 'Moderate confidence', classes: 'text-lab-amber   bg-lab-amber/8   border-lab-amber/25' },
  LOW:      { label: 'Limited confidence',  classes: 'text-lab-ember   bg-lab-ember/8   border-lab-ember/25' },
}

// ── Main component — renders only when all three new fields are present ────────
// Implements spec §7 first-screen specification. Old memos (no writer_output)
// continue to use the existing Hero/AIAnalystSection rendering below this.

export function FirstScreen({ m }: { m: MemoData }) {
  const { writer_output, expandable_cards, first_screen_signal_ids } = m

  // Graceful degradation — old memos skip this render entirely
  if (!writer_output || !expandable_cards || !first_screen_signal_ids) return null

  const { decision } = computeGroundedScore(m)
  const verdictLabel      = verdictLabelFromDecision(decision)
  const verdictText       = verdictDisplayText(verdictLabel)
  const verdictConfidence = computeVerdictConfidence(expandable_cards)
  const qualifier         = buildConfidenceQualifier(expandable_cards)
  const vcfg              = VERDICT_CONF_CFG[verdictConfidence]

  // §5.3 — get the 3 first-screen signal cards in selection order
  const signalEntries = first_screen_signal_ids
    .map(id => ({ id, card: expandable_cards[id] }))
    .filter((e): e is { id: string; card: ExpandableCardData } => !!e.card)

  // §7.5 — one card expanded at a time (AT-DISC-002)
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null)
  function toggleSignal(id: string) {
    setExpandedSignal(prev => prev === id ? null : id)
  }

  const verdictColorMap: Record<string, string> = {
    ENTRY_SUPPORTED:     'border-lab-verdant/30 bg-lab-verdant/[0.03]',
    VALIDATION_REQUIRED: 'border-lab-amber/30  bg-lab-amber/[0.03]',
    ENTRY_NOT_SUPPORTED: 'border-lab-ember/30  bg-lab-ember/[0.03]',
  }
  const verdictTextColorMap: Record<string, string> = {
    ENTRY_SUPPORTED:     'text-lab-verdant',
    VALIDATION_REQUIRED: 'text-lab-amber',
    ENTRY_NOT_SUPPORTED: 'text-lab-ember',
  }

  return (
    <LabCard className="overflow-hidden lab-animate-fade-up">
      <div className="px-5 py-4 border-b border-lab-border-soft flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-photon">
          Market Assessment
        </span>
        <span className="text-[10px] text-lab-text-tertiary">· v1 First Screen</span>
      </div>

      <div className="p-5 space-y-5">
        {/* ── 1. Verdict + confidence qualifier (§6.2, §6.4) ── */}
        <div className={`rounded-lab-md border px-4 py-3.5 ${verdictColorMap[verdictLabel] ?? ''}`}>
          <p className={`font-display text-xl font-semibold leading-tight ${verdictTextColorMap[verdictLabel] ?? 'text-lab-text-primary'}`}>
            {verdictText}
          </p>

          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 ${vcfg.classes}`}>
              {vcfg.label}
            </span>
            {qualifier && (
              <p className="text-[11px] text-lab-text-tertiary leading-snug">{qualifier}</p>
            )}
          </div>
        </div>

        {/* ── 2. Causal paragraph (§7.2 max 130 words) ── */}
        <div>
          <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest mb-1.5">
            Market Analysis
            {writer_output.causal_paragraph_is_fallback && (
              <span className="ml-1.5 text-lab-amber/60">(template)</span>
            )}
          </p>
          <p className="text-sm text-lab-text-secondary leading-relaxed">
            {writer_output.causal_paragraph}
          </p>
        </div>

        {/* ── 3. Signal cards A, B, C (§7.3, §7.5, AT-DISC-001, AT-DISC-002) ── */}
        {signalEntries.length > 0 && (
          <div>
            <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest mb-2">
              Signal Evidence
            </p>
            <div className="space-y-2">
              {signalEntries.map(({ id, card }) => (
                <SignalCard
                  key={id}
                  id={id}
                  card={card}
                  expanded={expandedSignal === id}
                  onToggle={() => toggleSignal(id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── 4. Primary risk sentence (§7.4 — equal weight to verdict) ── */}
        <RiskBlock
          riskSentence={writer_output.risk_sentence}
          isFallback={writer_output.risk_sentence_is_fallback}
        />

        {/* ── 5. Product thesis headline (§7.5 — expandable) ── */}
        <ThesisBlock
          headline={writer_output.product_thesis_headline}
          fullThesis={writer_output.product_thesis_full}
          isFallback={writer_output.product_thesis_is_fallback}
        />
      </div>
    </LabCard>
  )
}
