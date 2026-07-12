// "What would change this verdict" panel — the falsifiability-criteria
// pattern seen across multiple Stitch screens under two different titles;
// unified here into one component with a `title` prop.
export function KillCriteriaList({
  title = 'What would change this verdict', items,
}: { title?: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div className="bg-black text-white p-gutter">
      <p className="text-[11px] font-mono uppercase tracking-wider text-white/60 mb-3">{title}</p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
            <span className="text-verdict-negative shrink-0 mt-0.5">—</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
