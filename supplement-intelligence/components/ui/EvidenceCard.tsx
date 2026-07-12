// Timestamp + source + confidence row — used for evidence log entries
// (analysis progress streams, audit trails).
export function EvidenceCard({
  timestamp, source, text, confidence,
}: { timestamp: string; source: string; text: string; confidence?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-black/10 last:border-b-0">
      <span className="text-[10px] font-mono text-outline shrink-0 pt-0.5 whitespace-nowrap">{timestamp}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink">{text}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-mono uppercase text-outline">{source}</span>
          {confidence && (
            <>
              <span className="text-outline">·</span>
              <span className="text-[10px] font-mono text-outline">{confidence}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
