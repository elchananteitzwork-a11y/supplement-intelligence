// "What would change this verdict" panel — the falsifiability-criteria
// pattern seen across multiple Stitch screens under two different titles;
// unified here into one component with a `title` prop.
//
// UIv2-M2 Phase 2 pi-* migration DECISION (2026-07-21): this was the one
// deliberately inverted, full-bleed-black section in the legacy report
// (Stitch's own Investor Report §8 — every other section is a bordered
// white card). That "this is the one thing that stops even a good story"
// contrast is a real, intentional signal, not incidental neo-brutalist
// styling — so it's kept, translated honestly onto pi-ink/pi-cream rather
// than softened into the same light pi-card treatment as every other
// section. It also now visually rhymes rather than clashes with
// CandidateCoreHero directly above it on this same page: that hero already
// renders its own real-vs-plain "we would reverse this verdict if…" panel
// on a dark stage (bg-[#14130f], pi-cream text) — this section is the
// second, fuller-detail appearance of that same real content, so keeping
// it dark makes the two feel like one continuous idea instead of two
// unrelated design languages fighting for attention.
export function KillCriteriaList({
  title = 'What would change this verdict', items,
}: { title?: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div className="rounded-2xl bg-pi-ink text-pi-cream p-gutter">
      <p className="text-[11px] font-mono uppercase tracking-wider text-pi-cream/60 mb-3">{title}</p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
            <span className="text-pi-risk shrink-0 mt-0.5">—</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
