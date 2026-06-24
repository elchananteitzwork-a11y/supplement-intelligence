// ── Review text cleaning ────────────────────────────────────────────────────
//
// Fixes a real, confirmed artifact in Apify's web_wanderer/amazon-reviews-extractor
// output: Amazon's UI shows a truncated preview ending in "..." with a
// "Read more" expansion; this actor sometimes concatenates the truncated
// preview AND the full expanded text into one reviewText field, e.g.:
//
//   "Great product, really helped with my sleep. The capsules are a bit
//   large but... Great product, really helped with my sleep. The capsules
//   are a bit large but easy enough to swallow once you get used to them."
//
// Left unfixed, this would double-count phrases within a single review when
// clustering. Detection: find the first ellipsis, check whether the text
// after it starts by repeating the text before it. If so, the text after
// the ellipsis is the complete version — keep only that.

const ELLIPSIS_RE = /\s*(?:\.{3}|…)\s*/

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
}

export function cleanReviewText(raw: string): string {
  // Confirmed live (2026-06-24): some reviews come back with un-decoded HTML
  // entities (e.g. "doesn&#39;t") — left alone, "&#39;" tokenizes as a bare
  // "39" and corrupts theme labels ("doesn 39").
  let text = raw
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/’/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–|—/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

  const match = text.match(ELLIPSIS_RE)
  if (match && match.index !== undefined && match.index > 15) {
    const preview = text.slice(0, match.index)
    const rest    = text.slice(match.index + match[0].length)

    const previewKey = normalizeForCompare(preview)
    const restKey    = normalizeForCompare(rest).slice(0, previewKey.length)

    // Require a substantial, near-exact prefix match (not just a couple of
    // shared words) before concluding this is the duplication artifact.
    if (previewKey.length >= 20 && restKey === previewKey) {
      text = rest.trim()
    }
  }

  return text
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])|(?<=[.!?])$/)
    .map(s => s.trim())
    .filter(s => s.length >= 8)
}
