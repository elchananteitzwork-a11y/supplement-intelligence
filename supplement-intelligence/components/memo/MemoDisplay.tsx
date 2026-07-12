'use client'

// ═══════════════════════════════════════════════════════════════════════
// MemoDisplay — rebuilt around Stitch's actual Investor Report narrative
// architecture (80f611873dbf4a5087134b00e73b9f31.html), not the backend's
// field-storage shape. See docs/STITCH_NARRATIVE_REMAPPING.md for the
// original field-by-field mapping, and the migration checklist that
// completed the remaining legacy components:
//   - Current Signal rebuilt as CurrentSignal.tsx (compact pill + gauge,
//     replacing the old FirstScreenSummary.tsx "Investment Dossier" hero
//     card). writer_output.causal_paragraph relocated into The Thesis;
//     writer_output.risk_sentence relocated into Strategic Readiness; the
//     redundant per-dimension SignalRow mini-cards dropped (superseded by
//     Demand Intensity/Supply Landscape's fuller real evidence panels).
//   - Evidence & Confidence (old EvidenceConfidence.tsx, no Stitch
//     equivalent) moved out of the report opening into the extensions
//     zone — it was undercutting The Thesis by sitting second in the
//     report, ahead of Stitch's own narrative.
//   - Keyword Intelligence merged into Demand Intensity/Concordance
//     (same topic — real search-demand evidence); Manufacturing
//     Intelligence merged into Unit Economics (same topic — real COGS
//     provenance). Neither is a standalone top-level section anymore.
//   - Consumer Intelligence renamed/restructured to DifferentiationBrief.tsx
//     — Stitch's real Differentiation Brief section, now rendering real
//     review-derived quotes in Stitch's literal "Cluster: X" + pull-quote
//     format. The AI-invented persona pinboard that used to share this
//     section's name was renamed AdCopyIdeation.tsx and relocated into
//     Launch Strategy (go-to-market ideation, not customer evidence).
//   - Investment Thesis Detail restyled onto the row-based evidence
//     pattern used everywhere else in the report; "Top 3 Reasons to
//     Build"/"Top 3 Risks" renamed "Bull Case"/"Bear Case" to match the
//     investor-memo voice Stitch's own Kill Criteria section uses.
// ═══════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react'
import type { MemoData, BuildDecision } from '@/types/index'
import { computeGroundedScore } from '@/lib/scoring'
import { verdictLabelFromDecision } from '@/lib/ai-interpretation/verdict'
import { HardCard, KillCriteriaList } from '@/components/ui'
import { computeConfidence, deriveKillCriteria } from './shared'
import CurrentSignal from './CurrentSignal'
import EvidenceConfidence from './EvidenceConfidence'
import DemandIntensity from './DemandIntensity'
import SupplyLandscape from './SupplyLandscape'
import UnitEconomicsTable from './UnitEconomicsTable'
import DifferentiationBrief from './DifferentiationBrief'
import ReviewNarrative from './ReviewNarrative'
import StrategicReadinessChecklist from './StrategicReadinessChecklist'
import InvestmentThesis from './InvestmentThesis'
import NewsIntelligence from './NewsIntelligence'
import LaunchStrategy from './LaunchStrategy'

// ── Reading progress bar — real interaction read from Stitch's own
// inline <script> on the Investor Report screen (window.onscroll sets a
// fixed 2px bar's width to scroll %), not inferred from static markup.
function ReadingProgressBar() {
  const [pct, setPct] = useState(0)
  useEffect(() => {
    function onScroll() {
      const h = document.documentElement.scrollHeight - document.documentElement.clientHeight
      setPct(h > 0 ? (window.scrollY / h) * 100 : 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return <div className="fixed top-0 left-0 z-50 h-[2px] bg-black transition-[width]" style={{ width: `${pct}%` }} />
}

// ── Section 2: The Thesis — Stitch's canonical Investor Report renders
// this as exactly one bordered pull-quote paragraph and nothing else
// (re-confirmed by direct re-read of 80f611873dbf4a5087134b00e73b9f31.html
// for this pass — no caption box, no subheading, no confidence pill inside
// this section). why_now, writer_output.causal_paragraph, and the verdict
// confidence pill are real content with no place in that single-paragraph
// pattern; they were previously bolted onto this section, which was itself
// leftover legacy-IA bleed (extra grouping Stitch doesn't have here). They
// now open "Investment Thesis Detail" in the extensions zone instead — see
// InvestmentThesis.tsx.
function TheThesis({ m }: { m: MemoData }) {
  const thesis = m.market_thesis ?? m.executive_summary
  const decision = computeGroundedScore(m).decision
  const verdictLabel = verdictLabelFromDecision(decision)
  if (!thesis) return null
  return (
    <section id="the-thesis" className="scroll-mt-20">
      <blockquote className="border-l-[6px] border-black pl-6 sm:pl-8 py-2">
        <p className="text-headline-md text-ink font-extrabold leading-tight tracking-tight">{thesis}</p>
      </blockquote>
      <p className="sr-only">{verdictLabel}</p>
    </section>
  )
}

type SectionDef = { id: string; label: string }

const CORE_SECTIONS: SectionDef[] = [
  { id: 'current-signal',    label: 'Signal' },
  { id: 'the-thesis',        label: 'Thesis' },
  { id: 'demand-intensity',  label: 'Demand' },
  { id: 'supply-landscape',  label: 'Supply' },
  { id: 'unit-economics',    label: 'Economics' },
  { id: 'differentiation',   label: 'Differentiation' },
  { id: 'strategic-readiness', label: 'Readiness' },
  { id: 'kill-criteria',     label: 'Kill Criteria' },
]

const EXTENSION_SECTIONS: SectionDef[] = [
  { id: 'thesis-detail',     label: 'Thesis Detail' },
  { id: 'evidence-methodology', label: 'Methodology' },
  { id: 'news-intelligence', label: 'News' },
  { id: 'launch-strategy',   label: 'Launch' },
]

function getSections(m: MemoData): SectionDef[] {
  const ext = m.review_narrative
    ? [...EXTENSION_SECTIONS.slice(0, 2), { id: 'review-narrative', label: 'Reviews' }, ...EXTENSION_SECTIONS.slice(2)]
    : EXTENSION_SECTIONS
  return [...CORE_SECTIONS, ...ext]
}

function SectionNavMobile({ sections, active, onSelect }: { sections: SectionDef[]; active: string; onSelect: (id: string) => void }) {
  return (
    <div className="sticky top-0 z-30 -mx-4 px-4 sm:-mx-0 sm:px-0 backdrop-blur-md bg-surface/95 border-b border-black lg:hidden">
      <div className="flex items-center gap-1 overflow-x-auto py-2.5">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`relative text-[12.5px] font-medium px-3 py-2.5 whitespace-nowrap transition-colors ${active === s.id ? 'text-black font-bold' : 'text-outline hover:text-ink-variant'}`}
          >
            {s.label}
            {active === s.id && <span className="absolute left-2.5 right-2.5 bottom-0 h-[2px] bg-black" />}
          </button>
        ))}
      </div>
    </div>
  )
}

function ReportSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <HardCard>
        <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b-2 border-black">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-outline">{title}</h2>
        </div>
        {children}
      </HardCard>
    </section>
  )
}

export default function MemoDisplay({ memo: m, generatedAt }: { memo: MemoData; generatedAt?: string }) {
  const { decision } = computeGroundedScore(m)
  const confidence = computeConfidence(m)
  const containerRef = useRef<HTMLDivElement>(null)
  const sections = getSections(m)
  const [activeSection, setActiveSection] = useState(sections[0].id)
  const kill = deriveKillCriteria(m)

  function jumpTo(id: string) {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) setActiveSection(visible[0].target.id)
      },
      { rootMargin: '-10% 0px -70% 0px' },
    )
    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections])

  return (
    <div ref={containerRef}>
      <ReadingProgressBar />
      <SectionNavMobile sections={sections} active={activeSection} onSelect={jumpTo} />

      <div className="max-w-[720px] mx-auto space-y-section-gap py-2">

        {/* ── Section 1: Current Signal ─────────────────────────────── */}
        <CurrentSignal m={m} />

        {/* ── Section 2: The Thesis ─────────────────────────────────── */}
        <TheThesis m={m} />

        {/* ── Section 3: Demand Intensity / Concordance (includes real
            keyword-level search evidence, merged from the old standalone
            "Keyword Intelligence" section) ──────────────────────────── */}
        <ReportSection id="demand-intensity" title="Demand Intensity / Concordance"><DemandIntensity m={m} /></ReportSection>

        {/* ── Section 4: Supply Landscape ────────────────────────────── */}
        <ReportSection id="supply-landscape" title="Supply Landscape"><SupplyLandscape m={m} /></ReportSection>

        {/* ── Section 5: Unit Economics (includes real manufacturing/COGS
            provenance, merged from the old standalone "Manufacturing
            Intelligence" section) ───────────────────────────────────── */}
        <ReportSection id="unit-economics" title="Unit Economics"><UnitEconomicsTable m={m} /></ReportSection>

        {/* ── Section 6: Differentiation Brief — real review-derived
            clustered quotes in Stitch's literal format. AI-invented ad
            copy relocated to Launch Strategy (see DifferentiationBrief.tsx
            header). ──────────────────────────────────────────────────── */}
        <ReportSection id="differentiation" title="Differentiation Brief"><DifferentiationBrief m={m} /></ReportSection>

        {/* ── Section 7: Strategic Readiness (opens with the relocated
            writer_output.risk_sentence primary-risk statement) ───────── */}
        <ReportSection id="strategic-readiness" title="Strategic Readiness"><StrategicReadinessChecklist m={m} decision={decision} /></ReportSection>

        {/* ── Section 8: Kill Criteria — full-bleed black, matching
            Stitch's only inverted section (Investor Report §8) ─────── */}
        <section id="kill-criteria" className="scroll-mt-20">
          <KillCriteriaList title="Kill Criteria — we would reverse this verdict if…" items={kill} />
        </section>

        {/* ── Extensions: real backend data with no Stitch section ──── */}
        <div className="pt-4 border-t-4 border-double border-black">
          <p className="text-[10px] font-mono text-outline uppercase tracking-widest mb-1">Additional Real-Time Intelligence</p>
          <p className="text-[11px] text-outline italic">The sections below carry real data this analysis collected that Stitch&rsquo;s report design doesn&rsquo;t have a dedicated screen for — kept here rather than dropped, in the same visual language as the core report above.</p>
        </div>

        <ReportSection id="thesis-detail" title="Investment Thesis Detail"><InvestmentThesis m={m} decision={decision} /></ReportSection>
        <ReportSection id="evidence-methodology" title="Score Methodology &amp; Evidence Coverage"><EvidenceConfidence m={m} decision={decision} confidence={confidence} /></ReportSection>
        <ReportSection id="news-intelligence" title="Recent Market Intelligence"><NewsIntelligence m={m} /></ReportSection>
        {m.review_narrative && (
          <ReportSection id="review-narrative" title="Customer Review Intelligence"><ReviewNarrative m={m} /></ReportSection>
        )}
        <ReportSection id="launch-strategy" title="Launch Strategy"><LaunchStrategy m={m} /></ReportSection>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer className="py-10 border-t border-black text-center">
          <p className="font-mono text-[10px] text-outline uppercase tracking-widest">
            {generatedAt ? `Prepared ${new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : 'Confidential'} — scoring engine {m.scoring_version ?? 'unversioned'}
          </p>
        </footer>
      </div>
    </div>
  )
}
