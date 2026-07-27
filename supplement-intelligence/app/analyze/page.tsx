import { redirect } from 'next/navigation'

// Screen-consolidation pass (owner decision, 2026-07-27): /analyze (the
// legacy Discover/Analyze flow) and /app (the Stream) were two full entry
// points to the SAME analysis pipeline — identical POST /api/generate,
// identical quota; the only difference was where they sent you afterwards
// (/memo vs /app/brief, themselves now consolidated). Every "+ New
// Analysis" CTA now points at /app, and this route redirects old
// bookmarks there too, so exactly one way to create an analysis exists.
// The legacy 1,267-line client flow (InvestigationConsole, Opportunity
// Map, Inventory) is intact in git history for any future decision to
// restore parts of it.
export default function AnalyzePage() {
  redirect('/app')
}
