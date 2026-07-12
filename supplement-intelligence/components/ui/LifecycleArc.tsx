// Canonical stage-progression visual — a horizontal dot-line. Chosen over
// the other 3 implementations seen in the Stitch mockups (circular gauge,
// bubble scatter, curved SVG arc) because it degrades cleanest to real,
// sparse discrete-stage data (e.g. stage1→stage4/blocked) without implying
// continuous progress that doesn't exist in the data.
export function LifecycleArc({
  stages, currentIndex, blocked = false, className = '',
}: { stages: string[]; currentIndex: number; blocked?: boolean; className?: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      {stages.map((label, i) => {
        const done = !blocked && i < currentIndex
        const active = !blocked && i === currentIndex
        const isLast = i === stages.length - 1
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <span
                className={`w-3 h-3 rounded-full border-2 border-black ${
                  blocked && i === currentIndex ? 'bg-verdict-negative' : done || active ? 'bg-black' : 'bg-white'
                }`}
              />
              <span className={`text-[10px] font-mono uppercase tracking-wider whitespace-nowrap ${active ? 'text-black font-bold' : 'text-outline'}`}>
                {label}
              </span>
            </div>
            {!isLast && <div className={`h-[2px] flex-1 mx-1.5 ${done ? 'bg-black' : 'bg-outline-variant'}`} />}
          </div>
        )
      })}
    </div>
  )
}
