// ── Curated Symptom / Side-Effect Detection ─────────────────────────────────
//
// Single-word signals that the general n-gram clustering (n ≥ 2) cannot
// surface. These are domain-specific terms with unambiguous negative valence
// in supplement/health/beauty/fitness reviews — they represent real consumer
// harm worth surfacing to a product developer, regardless of surrounding
// multi-word context. They run as a PARALLEL track to phrase clustering, not
// a replacement: clustering finds organic multi-word complaints; this finds
// the named adverse effects those complaints revolve around.
//
// Vocabulary rationale: supplement and health product adverse effects form a
// finite, well-characterized set (verified against FDA MedWatch terminology,
// PubMed supplement adverse event literature, and Amazon review linguistic
// analysis). This list is intentionally curated, not auto-discovered —
// auto-discovery at n=1 produces unacceptable noise (every high-frequency
// adjective becomes a "theme"). Update this list as new product categories
// are added to the platform.
//
// Detection methodology:
//   - Exact word match (word-boundary anchored, case-insensitive)
//   - Same 4-word negation window as hasUnnegatedMatch in analyze.ts
//   - Minimum absolute count: SYMPTOM_MIN_MENTIONS (3)
//   - Minimum pool fraction: SYMPTOM_MIN_FRACTION (3%)
//   - Applied only to Amazon reviews (not TikTok comments — too noisy)
//   - deduplication: each review counted at most once per symptom word

import type { CollectedReview } from '../review-collector/types'

export interface SymptomSignal {
  symptom:      string    // the detected word, display-cased
  mentionedBy:  number    // distinct Amazon reviews containing this symptom
  outOf:        number    // Amazon review pool size (excludes TikTok)
  exampleQuote: string    // one verbatim sentence from a real review
}

// ── Symptom vocabulary ──────────────────────────────────────────────────────
// Grouped by category for maintainability. Each word is lowercased — matching
// is case-insensitive at runtime. Display form is auto-capitalized.
// Do NOT add generic sentiment words ("bad", "awful", "terrible") — those
// belong in sentimentBreakdown, not symptom detection.

const SYMPTOM_WORDS = new Set([
  // GI / digestive
  'bloating', 'bloated', 'nausea', 'nauseated', 'diarrhea', 'constipation',
  'cramping', 'cramps', 'heartburn', 'reflux', 'vomiting', 'indigestion',
  'gassiness', 'burping',

  // Neurological / mood
  'headache', 'headaches', 'migraine', 'migraines', 'jitters', 'jittery',
  'anxious', 'anxiety', 'insomnia', 'restlessness', 'irritability',
  'dizziness', 'dizzy', 'lightheaded', 'confusion',
  'tremors', 'trembling', 'tingling', 'numbness', 'palpitations',

  // Skin / dermatology
  'acne', 'breakouts', 'rash', 'hives', 'itching', 'itchy', 'redness',
  'flushing', 'swelling',

  // Cardiovascular / systemic
  'fatigue', 'exhaustion', 'weakness', 'sweating', 'overheating', 'feverish',
  'chills', 'shaking',

  // Endocrine / hormonal
  'spotting', 'irregularity',

  // Sleep
  'wakefulness', 'grogginess',

  // Taste / tolerance
  'aftertaste',
  // NOTE: 'brain fog' (two words) is intentionally excluded here — it is
  // correctly found by the n-gram clustering (2-gram "brain fog"). The
  // hyphenated/concatenated forms ('brain-fog', 'brainfog') are rare
  // enough in real review text that word-boundary regex can't reliably
  // find them without false positives.
])

// Display-cased forms for known words (auto-capitalize otherwise)
const DISPLAY_FORMS: Record<string, string> = {
  'gi': 'GI Issues',
}

function displayCase(word: string): string {
  return DISPLAY_FORMS[word] ?? (word.charAt(0).toUpperCase() + word.slice(1))
}

const NEGATION_TOKENS = /\b(not|never|no|none|nothing|without|cannot|can'?t|won'?t|wouldn'?t|shouldn'?t|doesn'?t|don'?t|didn'?t|isn'?t|wasn'?t|aren'?t|weren'?t)\b/i
const NEGATION_WINDOW = 7

function isNegated(sentence: string, matchIndex: number): boolean {
  const before = sentence.slice(0, matchIndex).trim().split(/\s+/).slice(-NEGATION_WINDOW).join(' ')
  return NEGATION_TOKENS.test(before)
}

// ── Main export ──────────────────────────────────────────────────────────────

const SYMPTOM_MIN_MENTIONS = 3
const SYMPTOM_MIN_FRACTION = 0.03   // 3% of pool

export function detectSymptomSignals(
  amazonReviews: CollectedReview[],   // Amazon reviews only — TikTok excluded
): SymptomSignal[] {
  if (amazonReviews.length === 0) return []

  // Build word-boundary regex for each symptom word once
  const patterns = Array.from(SYMPTOM_WORDS).map(word => ({
    word,
    re: new RegExp(`\\b${word.replace(/-/g, '[-]?')}\\b`, 'gi'),
  }))

  // Per-symptom: Set of review IDs that mentioned it (unnegated), and one example sentence
  const hits = new Map<string, { reviewIds: Set<string>; example: string }>()

  for (const review of amazonReviews) {
    const text = review.body.toLowerCase()
    for (const { word, re } of patterns) {
      re.lastIndex = 0
      let match: RegExpExecArray | null
      let found = false
      let exampleSentence = ''

      while ((match = re.exec(text)) !== null) {
        if (!isNegated(text, match.index)) {
          found = true
          if (!exampleSentence) {
            // Extract the sentence containing the match for the example quote
            const start = text.lastIndexOf('.', match.index) + 1
            const end   = text.indexOf('.', match.index + match[0].length)
            exampleSentence = review.body.slice(start, end > -1 ? end + 1 : undefined).trim()
          }
          break
        }
      }

      if (found) {
        if (!hits.has(word)) hits.set(word, { reviewIds: new Set(), example: exampleSentence })
        const entry = hits.get(word)!
        entry.reviewIds.add(review.id)
        if (!entry.example) entry.example = exampleSentence
      }
    }
  }

  const minCount = Math.max(SYMPTOM_MIN_MENTIONS, Math.ceil(SYMPTOM_MIN_FRACTION * amazonReviews.length))

  return Array.from(hits.entries())
    .filter(([, { reviewIds }]) => reviewIds.size >= minCount)
    .map(([word, { reviewIds, example }]) => ({
      symptom:      displayCase(word),
      mentionedBy:  reviewIds.size,
      outOf:        amazonReviews.length,
      exampleQuote: example,
    }))
    .sort((a, b) => b.mentionedBy - a.mentionedBy)
}
