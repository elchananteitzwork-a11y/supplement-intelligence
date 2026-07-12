// ═══════════════════════════════════════════════════════════════════════
// Differentiation Brief — canonical Stitch section (Investor Report §6):
// clustered REAL customer quotes, each with a "Cluster: X" label and a
// large italic pull-quote. Renamed from components/memo/ConsumerIntelligence.tsx
// (the backend field name, not a Stitch section) — real review-text themes
// from lib/consumer-intelligence, every quote traceable to a literal
// phrase pulled from real customer reviews via deterministic clustering,
// never LLM summarization.
//
// The AI-invented customer_language pinboard that used to render beneath
// this (old components/memo/DifferentiationBrief.tsx) has been renamed to
// AdCopyIdeation.tsx and relocated into the Launch Strategy extension —
// keeping AI-invented ad copy under the same section name as real
// clustered customer quotes was a naming collision that made the real
// evidence look no more authoritative than the synthesized material next
// to it.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import type { MemoData } from '@/types/index'
import type { ThemeInsight } from '@/lib/consumer-intelligence'
import { consumerIntelligenceProvenance } from '@/lib/provenance'
import { ProvenanceBadge } from './shared'

// ── Stitch's literal cluster pattern: a dot + "Cluster: {label}" + one
// large italic pull-quote. Picks the single most-mentioned real example
// quote per theme — never fabricates a quote, never shows a theme with no
// real exampleQuote.
function ClusterQuote({ theme }: { theme: ThemeInsight }) {
  if (!theme.exampleQuote) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-black shrink-0" />
        <span className="font-bold uppercase text-xs tracking-wide">Cluster: {theme.label}</span>
        <span className="text-[10px] font-mono text-outline">{theme.mentionedBy}/{theme.outOf} reviews</span>
      </div>
      <p className="italic text-lg text-ink-variant border-l-2 border-outline-variant pl-4 py-1">
        &ldquo;{theme.exampleQuote}&rdquo;
      </p>
    </div>
  )
}

function ThemeList({ themes, limit, emptyLabel }: { themes: ThemeInsight[]; limit?: number; emptyLabel: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!themes.length) return <p className="text-xs text-outline italic py-2">{emptyLabel}</p>
  const shown = (!limit || expanded) ? themes : themes.slice(0, limit)
  const hiddenCount = limit ? Math.max(0, themes.length - limit) : 0
  return (
    <ul className="space-y-2">
      {shown.map((t, i) => (
        <li key={i} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-black font-medium">&ldquo;{t.label}&rdquo;</span>
            <span className="text-[11px] font-mono text-outline shrink-0">{t.mentionedBy}/{t.outOf} reviews</span>
          </div>
          <p className="text-[11px] text-outline italic mt-0.5 truncate">&ldquo;{t.exampleQuote}&rdquo;</p>
        </li>
      ))}
      {hiddenCount > 0 && (
        <li><button onClick={() => setExpanded(true)} className="text-[11px] text-verdict-caution-text hover:underline transition-colors">Show {hiddenCount} more →</button></li>
      )}
    </ul>
  )
}

function SentimentBars({ m }: { m: MemoData }) {
  const sb = m.consumer_intelligence?.sentimentBreakdown
  if (!sb) return null
  return (
    <div className="space-y-1.5">
      {sb.distribution.slice().reverse().map(d => (
        <div key={d.star} className="flex items-center gap-2 text-[11px]">
          <span className="text-outline w-10 shrink-0">{d.star}★</span>
          <div className="flex-1 h-1.5 bg-outline-variant overflow-hidden"><div className="h-full bg-black" style={{ width: `${d.pct}%` }} /></div>
          <span className="text-outline font-mono w-10 text-right shrink-0">{d.pct}%</span>
        </div>
      ))}
    </div>
  )
}

export default function DifferentiationBrief({ m }: { m: MemoData }) {
  const ci = m.consumer_intelligence
  const provenance = consumerIntelligenceProvenance(ci)
  const attemptedButFailed = !ci && !!m.signal_metadata?.consumer_intelligence_attempted
  const rv = m.signal_evidence?.review_velocity?.value
  const redditPainExamples = rv?.pain_point_examples

  // Top real clusters, Stitch's primary pattern — one from complaints, one
  // from mentioned problems, one from feature requests, whichever real
  // themes actually exist (never padded to a fixed count of 3).
  const topClusters = [
    ci?.negativeThemes?.[0],
    ci?.mostMentionedProblems?.find(t => t.label !== ci?.negativeThemes?.[0]?.label),
    ci?.featureRequests?.[0],
  ].filter((t): t is ThemeInsight => !!t?.exampleQuote)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 mb-1">
        {provenance && <ProvenanceBadge p={provenance} />}
      </div>

      {redditPainExamples && redditPainExamples.length > 0 && (
        <div className="bg-white border border-black p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-black">Real Reddit Discussion</p>
            <ProvenanceBadge p={{ level: 'verified', source: 'Reddit', detail: `Real verbatim post titles/snippets from r/Supplements and related subreddits that matched problem-language patterns — ${rv?.monthly_reviews ?? 'unknown volume'}, ${rv?.sentiment ?? 'unscored'} sentiment.` }} />
          </div>
          <ul className="space-y-2">{redditPainExamples.map((ex, i) => <li key={i} className="text-sm text-ink-variant leading-relaxed">&ldquo;{ex}&rdquo;</li>)}</ul>
        </div>
      )}

      {!ci ? (
        attemptedButFailed ? (
          <div className="border border-black bg-white px-3 py-2.5">
            <p className="text-xs font-semibold text-verdict-caution-text mb-1">Some providers timed out</p>
            <p className="text-[11px] text-outline">Real competitor products were found, but the review-data provider didn&rsquo;t return in time. This section is empty rather than estimated — re-running the analysis may succeed if the provider was just slow this once.</p>
          </div>
        ) : (
          <p className="text-sm font-mono text-outline italic py-3">No data available</p>
        )
      ) : (
        <div className="space-y-8">
          {/* Stitch's literal §6 pattern is bullet + "Cluster: X" + one
              pull-quote, repeated — nothing else (re-confirmed by direct
              re-read of 80f611873dbf4a5087134b00e73b9f31.html lines
              ~490-520). Always render this zone, even when this product's
              review sample has no theme with a real exampleQuote, rather
              than letting the section fall straight through to the
              sentiment/theme grid below — that grid has no Stitch
              equivalent and reads as the old ConsumerIntelligence.tsx
              dashboard when it's the first thing shown. */}
          {topClusters.length > 0 ? (
            <div className="space-y-6">
              {topClusters.map((t, i) => <ClusterQuote key={i} theme={t} />)}
            </div>
          ) : (
            <p className="text-sm text-outline italic">No distinct complaint, problem, or feature-request cluster in this review sample met the minimum mention threshold for a pull-quote. Sentiment and theme detail collected for this product is below.</p>
          )}

          <p className="text-[11px] text-outline">
            Source: {ci.totalReviewsCollected} real reviews
            {(ci.productsAnalyzed ?? []).length > 0 && <> across {(ci.productsAnalyzed ?? []).map(p => p.brand).join(', ')}</>}
            {' '}({ci.confidence >= 0.7 ? 'high' : ci.confidence >= 0.4 ? 'moderate' : 'low'} confidence)
          </p>

          <div className="grid sm:grid-cols-2 gap-5">
            <div className="bg-white border border-black p-4">
              <p className="text-xs font-semibold text-black mb-3">Sentiment Breakdown</p>
              <p className="text-[11px] text-outline mb-2">
                Avg rating <span className="font-mono text-ink-variant">{ci.sentimentBreakdown.avgRating}/5</span> across {ci.sentimentBreakdown.totalReviews} reviews
                {' '}— {ci.sentimentBreakdown.positivePct}% positive, {ci.sentimentBreakdown.neutralPct}% neutral, {ci.sentimentBreakdown.negativePct}% negative
              </p>
              <SentimentBars m={m} />
            </div>

            <div className="bg-white border border-black p-4">
              <p className="text-xs font-semibold text-black mb-3">Top Complaints</p>
              <ThemeList themes={ci.negativeThemes} limit={5} emptyLabel="No recurring complaints met the minimum review-count threshold." />
            </div>

            <div className="bg-white border border-black p-4">
              <p className="text-xs font-semibold text-black mb-3">What Customers Love</p>
              <ThemeList themes={ci.positiveThemes} limit={5} emptyLabel="No recurring praise met the minimum review-count threshold." />
            </div>

            <div className="bg-white border border-black p-4">
              <p className="text-xs font-semibold text-black mb-3">Most Mentioned Problems <span className="text-[10px] text-outline font-normal">(any rating)</span></p>
              <ThemeList themes={ci.mostMentionedProblems} limit={5} emptyLabel="No problems mentioned widely enough across all ratings." />
            </div>

            <div className="bg-white border border-black p-4">
              <p className="text-xs font-semibold text-black mb-3">Feature Requests</p>
              <ThemeList themes={ci.featureRequests} limit={5} emptyLabel="No recurring feature requests found in this review sample." />
            </div>

            {ci.symptomSignals && ci.symptomSignals.length > 0 && (
              <div className="bg-white border border-black p-4 sm:col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-semibold text-black">Adverse Effect Signals</p>
                  <span className="text-[10px] text-verdict-negative bg-white border border-black px-1.5 py-0.5">Amazon reviews only</span>
                </div>
                <p className="text-[11px] text-outline mb-3">Single-word adverse effects detected by exact-match scan — complement to phrase clustering above. Each count is distinct reviews containing the term (unnegated).</p>
                <ul className="space-y-2">
                  {ci.symptomSignals.slice(0, 8).map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 min-w-[90px] text-xs font-mono font-semibold text-black">{s.symptom}</span>
                      <span className="text-[11px] text-outline">
                        {s.mentionedBy}/{s.outOf} reviews ({Math.round((s.mentionedBy / s.outOf) * 100)}%)
                        {s.exampleQuote && <> — &ldquo;{s.exampleQuote.slice(0, 120)}{s.exampleQuote.length > 120 ? '…' : ''}&rdquo;</>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
