'use client'

// ═══════════════════════════════════════════════════════════════════════
// MemoDisplay — RD Report-Chapters restructure (2026-07-23, owner-approved
// mockup: design-prototypes/report-chapters.html, commit 83241ce). Owner
// directive this pass fixes: "light, easy-to-understand UX... I don't want
// long pages, every page should look good and be understandable." The old
// version of this file rendered all 14 sections below as one continuous
// stack of cream cards — a genuinely long page. This version groups the
// EXACT SAME 14 section components (imports and props unchanged, no
// internals touched, no data/derivation logic touched) into 6 chapters
// (Demand / Competition / Economics / Customers / Risk & Verdict /
// Methodology — the approved mockup's IA, and its own footer note's exact
// section→chapter mapping) rendered as a single-open-at-a-time accordion,
// collapsed by default, so the page reads short. See this file's own
// CHAPTERS definition below for the literal mapping.
//
// Register: pi-cream (2026-07-23, owner reverted the Terminal Noir dark
// register back to the warm-cream design language after reviewing it live
// — see CandidateCoreHero.tsx's own header comment for the same reversal).
// Each chapter is a plain bordered pi-card surface (`bg-pi-card`,
// `border-pi-hairline`) — the same convention every section component
// already used before this restructure, and the one CandidateCoreHero.tsx
// itself now uses again above this. GlassPanel (built for the dark/photo
// "One World" register) doesn't suit a flat cream page, so this pass
// doesn't use it, matching the sibling hero card's own reversion.
//
// HONEST SCOPE NOTE (flagged to the Planner in the delivery report, not
// silently decided): the approved mockup's HTML comments also describe
// content-level "duplication resolutions" — deleting CurrentSignal's
// verdict pill, merging Differentiation/Reviews into a single lens toggle,
// one confidence word-mapping, one Market Accessibility number, one COGS
// number. This pass implements ONLY the lens toggle for Customers (pure
// conditional rendering at this orchestration layer — DifferentiationBrief
// .tsx and ReviewNarrative.tsx are both still rendered, byte-for-byte
// unchanged, the toggle just shows one at a time). The other resolutions
// require editing an individual section component's own internals (e.g.
// removing a pill from CurrentSignal.tsx), which the R&D brief for this
// milestone explicitly scoped OUT ("do not rewrite their internals") —
// CurrentSignal therefore still renders its full existing content
// (including its verdict pill) inside the Demand chapter, unchanged.
//
// The 5 real blade-click target ids (current-signal is a dead-code fallback
// in coreDataAdapter.ts, never actually produced — verified by reading
// SECTION_ID_FOR_DIMENSION there, all 6 BLADE_KEY_ORDER keys are mapped
// explicitly) — demand-intensity, supply-landscape, unit-economics,
// differentiation, strategic-readiness — are preserved as real ids
// findable by getElementById at all times, because CandidateCoreHero.tsx's
// blade-click jumpToSection (a file explicitly out of scope to edit this
// pass) does a raw `document.getElementById(id)?.scrollIntoView(...)`.
// Every chapter stays MOUNTED in the DOM at all times (collapsed chapters
// use a CSS grid-rows height collapse, not conditional unmounting) — but
// since a collapsed chapter's body has ~0px height, a deep id nested
// inside it would scrollIntoView to a spot BELOW that chapter's own
// header (verified live: the click landed with the target chapter's
// header scrolled just off the top edge). Fixed by moving each of these 5
// ids onto an anchor at the very TOP of its own chapter (see the `anchorId`
// prop on <Chapter> below, with the matching internal section renamed to
// an "-detail" suffix so there's no duplicate DOM id) — a blade click now
// lands with the correct chapter's header fully visible at the top of the
// viewport; one extra manual expand-click is still needed to see the
// content itself, which is the honest, disclosed tradeoff of not being
// able to teach the excluded CandidateCoreHero.tsx about the new accordion
// structure.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { MemoData, BuildDecision } from '@/types/index'
import { computeGroundedScore } from '@/lib/scoring'
import { computeConfidenceAssessment } from '@/lib/confidence'
import { verdictLabelFromDecision } from '@/lib/ai-interpretation/verdict'
import { KillCriteriaList } from '@/components/ui'
import { deriveKillCriteriaItems } from './shared'
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
import MarketingIntelligence from './MarketingIntelligence'
import LaunchStrategy from './LaunchStrategy'

// ── Section 2 (inside the Demand chapter): The Thesis — Stitch's canonical
// Investor Report renders this as exactly one bordered pull-quote
// paragraph and nothing else. Local to this file (not one of the 14
// imported section components), so it's fair game to restyle onto the
// Terminal Noir register directly, unlike the imported sections below.
function TheThesis({ m }: { m: MemoData }) {
  const thesis = m.market_thesis ?? m.executive_summary
  const decision = computeGroundedScore(m).decision
  const verdictLabel = verdictLabelFromDecision(decision)
  if (!thesis) return null
  return (
    <section id="the-thesis" className="scroll-mt-20">
      <blockquote className="border-l-[6px] border-pi-gold-deep pl-6 sm:pl-8 py-2">
        <p className="font-serif text-[20px] sm:text-[24px] font-semibold leading-snug tracking-tight text-pi-ink">{thesis}</p>
      </blockquote>
      <p className="sr-only">{verdictLabel}</p>
    </section>
  )
}

// ── Sub-section header inside an open chapter — quiet cream label, direct
// visual analog of the old ReportSection wrapper's title bar (font-mono
// uppercase pi-sub), just re-tokened for the chapter layout. The section's
// own content (an unmodified imported component) renders below it, on its
// own native cream pi-card surface — see this file's header comment's
// HONEST SCOPE NOTE for why that inner surface isn't touched here.
function SubSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h3 className="mb-4 border-b border-pi-hairline pb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-pi-sub">{title}</h3>
      {children}
    </section>
  )
}

type ChapterId = 'demand' | 'competition' | 'economics' | 'customers' | 'risk' | 'methodology'

interface ChapterMeta { id: ChapterId; n: string; label: string; deemphasized?: boolean }

// The approved mockup's own footer note ("chapter split per the audited
// natural groupings"), applied to the real, current 14-section list:
//   Demand        — CurrentSignal + TheThesis + DemandIntensity + MarketingIntelligence
//   Competition    — SupplyLandscape
//   Economics      — UnitEconomicsTable + LaunchStrategy
//   Customers      — DifferentiationBrief + ReviewNarrative (lens toggle)
//   Risk & Verdict — StrategicReadinessChecklist + KillCriteria + InvestmentThesis + NewsIntelligence
//   Methodology    — EvidenceConfidence (de-emphasized, closed by default — true of every chapter here)
const CHAPTER_META: ChapterMeta[] = [
  { id: 'demand',      n: '1', label: 'Demand' },
  { id: 'competition', n: '2', label: 'Competition' },
  { id: 'economics',   n: '3', label: 'Economics' },
  { id: 'customers',   n: '4', label: 'Customers' },
  { id: 'risk',        n: '5', label: 'Risk & Verdict' },
  { id: 'methodology', n: '·', label: 'Methodology', deemphasized: true },
]

// ── Chapter nav — the approved mockup's core new element: sticky
// horizontal pills, one chapter open at a time. Replaces the old flat
// 14-item SectionNavMobile (mobile-only before) — this is now the single
// nav surface at every viewport, matching the mockup.
function ChapterNav({ active, onSelect }: { active: ChapterId | null; onSelect: (id: ChapterId) => void }) {
  return (
    <nav aria-label="Report chapters" className="sticky top-[52px] z-30 -mx-1 mb-6 flex gap-1.5 overflow-x-auto bg-pi-cream/95 px-1 py-2 backdrop-blur-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {CHAPTER_META.map(c => {
        const isActive = active === c.id
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            aria-expanded={isActive}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-medium transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright ${
              isActive
                ? 'border-pi-gold-deep bg-pi-gold-deep text-pi-ink font-semibold'
                : c.deemphasized
                  ? 'border-pi-hairline text-pi-faint hover:text-pi-sub hover:border-pi-hairline'
                  : 'border-pi-hairline text-pi-sub hover:text-pi-ink hover:border-pi-ink/30'
            }`}
          >
            <span className="font-mono text-[10px] opacity-60">{c.n}</span>
            {c.label}
          </button>
        )
      })}
    </nav>
  )
}

// ── One chapter: a plain pi-card surface, header always visible (so its
// blade-target ids underneath stay reachable — see this file's header
// comment), body height-collapsed via CSS grid-rows when not the active
// chapter. `motion-reduce:` gates the transition itself (not just an
// animation keyframe) — a reduced-motion user gets an instant open/close,
// same "no animation, not merely a faster one" discipline as every other
// port tonight.
function Chapter({ meta, anchorId, isOpen, onToggle, children }: { meta: ChapterMeta; anchorId?: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-pi-hairline bg-pi-card">
      {/* Blade-jump landing anchor — CandidateCoreHero.tsx's jumpToSection
          (out of scope to edit this pass) does a raw
          document.getElementById(id)?.scrollIntoView(...). The id it looks
          for used to sit on the deeply-nested section that's now inside a
          collapsed accordion body; putting it here instead (right at the
          top of this always-mounted chapter header, with scroll-mt-20 —
          the same offset convention every other section in this app
          already uses) means a blade click for a section inside a
          currently-collapsed chapter lands with that chapter's header
          fully visible at the top of the viewport, one click away from
          expanding — the best reachable outcome without editing the
          excluded file. See this file's own header comment for the full
          tradeoff writeup. */}
      {anchorId && <span id={anchorId} className="block scroll-mt-20" aria-hidden />}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`chapter-panel-${meta.id}`}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-pi-ink/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pi-gold-bright sm:px-8"
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-pi-gold-deep">Chapter {meta.n}</span>
          <span className={`truncate font-serif text-[19px] font-semibold sm:text-[22px] ${meta.deemphasized ? 'text-pi-sub' : 'text-pi-ink'}`}>{meta.label}</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-pi-sub transition-transform duration-300 motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <div
        id={`chapter-panel-${meta.id}`}
        className="grid transition-[grid-template-rows] duration-500 ease-cine motion-reduce:transition-none"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="space-y-8 px-6 pb-8 pt-2 sm:px-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Customers chapter's lens toggle — real conditional rendering between
// two already-real, unmodified components (DifferentiationBrief: real
// deterministic quote clustering; ReviewNarrative: real AI synthesis over
// the same review corpus). Neither component is edited; this is pure
// orchestration, matching the approved mockup's "two lenses on one page,
// labeled" interaction.
function CustomersLenses({ m }: { m: MemoData }) {
  const [lens, setLens] = useState<'counted' | 'synthesis'>('counted')
  return (
    <div>
      <div role="tablist" aria-label="Analysis method" className="mb-6 inline-flex rounded-full border border-pi-hairline bg-pi-sand p-1">
        <button
          type="button"
          role="tab"
          aria-selected={lens === 'counted'}
          onClick={() => setLens('counted')}
          className={`rounded-full px-4 py-2 text-[12.5px] font-medium transition-colors ${lens === 'counted' ? 'bg-pi-gold-deep text-pi-ink font-semibold' : 'text-pi-sub hover:text-pi-ink'}`}
        >
          Differentiation Brief · counted from reviews
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={lens === 'synthesis'}
          onClick={() => setLens('synthesis')}
          className={`rounded-full px-4 py-2 text-[12.5px] font-medium transition-colors ${lens === 'synthesis' ? 'bg-pi-gold-deep text-pi-ink font-semibold' : 'text-pi-sub hover:text-pi-ink'}`}
        >
          Review Intelligence · AI synthesis
        </button>
      </div>
      {lens === 'counted' ? (
        <SubSection id="differentiation-detail" title="Differentiation Brief">
          <DifferentiationBrief m={m} />
        </SubSection>
      ) : (
        <SubSection id="review-narrative" title="Customer Review Intelligence">
          <ReviewNarrative m={m} />
        </SubSection>
      )}
    </div>
  )
}

export default function MemoDisplay({ memo: m, generatedAt }: { memo: MemoData; generatedAt?: string }) {
  const grounded = computeGroundedScore(m)
  const { decision } = grounded
  // Roadmap M1.4 (Phase 3 integration): the exact same real, pure function
  // app/api/generate/route.ts already calls server-side, given the exact
  // same grounded inputs recomputed above (same pattern this component
  // already used for `decision` itself) — a bit-for-bit identical result,
  // not a second, divergent confidence calculation.
  const confidenceAssessment = computeConfidenceAssessment(grounded)
  // Roadmap M2.8: real, machine-evaluable kill criteria — null (never a
  // fabricated list) when this analysis predates the feature.
  const killItems = deriveKillCriteriaItems(m.kill_criteria)

  // Collapsed by default (every chapter closed) — this is the actual "no
  // long pages" fix: first paint is 6 short chapter headers, not 14
  // stacked cards. Single-open-at-a-time: opening one chapter closes any
  // other that was open.
  const [openChapter, setOpenChapter] = useState<ChapterId | null>(null)

  function toggleChapter(id: ChapterId) {
    setOpenChapter(cur => (cur === id ? null : id))
  }

  return (
    <div className="max-w-[720px] mx-auto py-2">
      <ChapterNav active={openChapter} onSelect={toggleChapter} />

      <div className="space-y-4">
        {/* ── Chapter 1: Demand ──────────────────────────────────────── */}
        <Chapter meta={CHAPTER_META[0]} anchorId="demand-intensity" isOpen={openChapter === 'demand'} onToggle={() => toggleChapter('demand')}>
          <CurrentSignal m={m} />
          <TheThesis m={m} />
          <SubSection id="demand-intensity-detail" title="Demand Intensity / Concordance"><DemandIntensity m={m} /></SubSection>
          <SubSection id="marketing-intelligence" title="Marketing Intelligence"><MarketingIntelligence m={m} /></SubSection>
        </Chapter>

        {/* ── Chapter 2: Competition ─────────────────────────────────── */}
        <Chapter meta={CHAPTER_META[1]} anchorId="supply-landscape" isOpen={openChapter === 'competition'} onToggle={() => toggleChapter('competition')}>
          <SubSection id="supply-landscape-detail" title="Supply Landscape"><SupplyLandscape m={m} /></SubSection>
        </Chapter>

        {/* ── Chapter 3: Economics ───────────────────────────────────── */}
        <Chapter meta={CHAPTER_META[2]} anchorId="unit-economics" isOpen={openChapter === 'economics'} onToggle={() => toggleChapter('economics')}>
          <SubSection id="unit-economics-detail" title="Unit Economics"><UnitEconomicsTable m={m} /></SubSection>
          <SubSection id="launch-strategy" title="Launch Strategy"><LaunchStrategy m={m} /></SubSection>
        </Chapter>

        {/* ── Chapter 4: Customers (merged Differentiation/Reviews lens) ─ */}
        <Chapter meta={CHAPTER_META[3]} anchorId="differentiation" isOpen={openChapter === 'customers'} onToggle={() => toggleChapter('customers')}>
          <CustomersLenses m={m} />
        </Chapter>

        {/* ── Chapter 5: Risk & Verdict ──────────────────────────────── */}
        <Chapter meta={CHAPTER_META[4]} anchorId="strategic-readiness" isOpen={openChapter === 'risk'} onToggle={() => toggleChapter('risk')}>
          <SubSection id="strategic-readiness-detail" title="Strategic Readiness"><StrategicReadinessChecklist m={m} decision={decision} /></SubSection>

          {/* Kill Criteria — full-bleed pi-ink/pi-cream, matching Stitch's
              only inverted section; see components/ui/KillCriteriaList.tsx's
              own header comment for why this stays deliberately dark
              (a pre-existing, standalone design choice, not part of
              tonight's noir register or its reversal) rather than
              softening to the light pi-card treatment used everywhere
              else. Roadmap M2.8's real, machine-evaluable memo.kill_criteria
              — honest unavailable note (not a silently-vanished section)
              when this analysis predates the feature. */}
          <section id="kill-criteria" className="scroll-mt-24">
            {killItems ? (
              <KillCriteriaList title="Kill Criteria — we would reverse this verdict if…" items={killItems} />
            ) : (
              <div className="rounded-2xl border border-pi-hairline bg-pi-sand p-gutter">
                <p className="text-[11px] font-mono uppercase tracking-wider text-pi-sub mb-2">Kill Criteria — we would reverse this verdict if…</p>
                <p className="text-sm text-pi-sub italic">Not available — this analysis predates the kill-criteria feature.</p>
              </div>
            )}
          </section>

          <SubSection id="thesis-detail" title="Investment Thesis Detail"><InvestmentThesis m={m} decision={decision} /></SubSection>
          <SubSection id="news-intelligence" title="Recent Market Intelligence"><NewsIntelligence m={m} /></SubSection>
        </Chapter>

        {/* ── Chapter 6: Methodology — de-emphasized, closed by default
            (true of every chapter above too; the mockup's "closed by
            default" note for this one specifically is automatically
            satisfied by the same accordion mechanics, not special-cased). */}
        <Chapter meta={CHAPTER_META[5]} isOpen={openChapter === 'methodology'} onToggle={() => toggleChapter('methodology')}>
          <SubSection id="evidence-methodology" title="Score Methodology &amp; Evidence Coverage">
            <EvidenceConfidence m={m} decision={decision} confidenceAssessment={confidenceAssessment} />
          </SubSection>
        </Chapter>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="py-10 border-t border-pi-hairline text-center mt-4">
        <p className="font-mono text-[10px] text-pi-sub uppercase tracking-widest">
          {generatedAt ? `Prepared ${new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : 'Confidential'} — scoring engine {m.scoring_version ?? 'unversioned'}
        </p>
      </footer>
    </div>
  )
}
