// ── Deterministic phrase clustering ─────────────────────────────────────────
//
// No LLM, no free-form summarization. Every theme surfaced here is a literal
// n-gram that appeared in real review sentences, grouped by a stemmed
// canonical key so minor wording variants ("capsule too big" / "capsules
// are too large") collapse into one theme — but the DISPLAY label is always
// the most common verbatim surface form, never an invented paraphrase.
//
// This is intentionally simple (stopword-strip + suffix-stemming + n-gram
// frequency), not embedding-based clustering — it's fully inspectable: any
// theme's review count can be verified by re-reading the matched sentences.

export interface SentenceRef {
  reviewId: string
  text:     string   // original-cased sentence, for building display labels
}

export interface PhraseCluster {
  label:        string     // most common verbatim surface form
  reviewCount:  number     // distinct reviews containing this phrase
  reviewIds:    string[]
  exampleQuote: string     // one real, full sentence containing the phrase
}

const STOPWORDS = new Set([
  'a','an','the','this','that','these','those','i','you','he','she','it','we','they',
  'me','him','her','us','them','my','your','his','its','our','their','mine','yours',
  'is','am','are','was','were','be','been','being','have','has','had','having',
  'do','does','did','doing','will','would','shall','should','can','could','may','might','must',
  'and','or','but','if','because','as','until','while','of','at','by','for','with','about',
  'against','between','into','through','during','before','after','above','below','to','from',
  'up','down','in','out','on','off','over','under','again','further','then','once','here','there',
  'when','where','why','how','all','any','both','each','few','more','most','other','some','such',
  'no','nor','not','only','own','same','so','than','too','very','just','also','really','quite',
  'get','got','getting','one','im','ive','dont','didnt','doesnt','isnt','wasnt','werent',
  's','t','d','ll','m','re','ve','y',
])

function stem(word: string): string {
  let w = word
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 4 && w.endsWith('es'))  return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed'))  return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

function tokenize(sentence: string): string[] {
  return sentence
    .toLowerCase()
    .replace(/'/g, '')          // "i've" -> "ive", matches the stopword list's apostrophe-free forms
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

// Content words only (stopwords + product/brand-name words stripped), in
// original sentence order — n-grams are then built from this reduced
// sequence, which finds recurring patterns more reliably than raw token
// n-grams full of filler words. Excluding product/brand words matters:
// without it, "magnesium glycinate" or "pure encapsulations" surface as
// "themes" when they're just the product's own name, not a customer
// sentiment — not a real insight.
function contentWords(sentence: string, excluded: Set<string>): string[] {
  return tokenize(sentence).filter(w => !STOPWORDS.has(w) && !excluded.has(w) && w.length > 1)
}

interface ClusterAccum {
  reviewIds:     Set<string>
  surfaceCounts: Map<string, number>   // verbatim n-gram -> occurrence count
  quotes:        Map<string, string>   // verbatim n-gram -> one example full sentence
}

export function clusterPhrases(
  sentences: SentenceRef[],
  opts: {
    minReviewCount?:  number
    minPoolFraction?: number
    nGramSizes?:      number[]
    excludeWords?:    string[]   // product/brand/query words — not a customer sentiment
  } = {},
): PhraseCluster[] {
  const totalPoolReviews = new Set(sentences.map(s => s.reviewId)).size
  const minCount = Math.max(
    opts.minReviewCount ?? 3,
    Math.ceil((opts.minPoolFraction ?? 0.05) * totalPoolReviews),
  )
  const sizes    = opts.nGramSizes ?? [2, 3]
  const excluded = new Set((opts.excludeWords ?? []).map(w => w.toLowerCase()))

  const clusters = new Map<string, ClusterAccum>()

  for (const { reviewId, text } of sentences) {
    const words = contentWords(text, excluded)
    if (words.length < 2) continue

    for (const n of sizes) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n)
        // Sorted (order-independent) so "sleep better" and "better sleep"
        // group as one theme instead of two near-duplicate micro-clusters —
        // word ORDER carries little signal at this n-gram size, word
        // PRESENCE does. Surface form below keeps natural order for display.
        const canonicalKey = gram.map(stem).sort().join(' ')
        const surfaceForm  = gram.join(' ')

        let acc = clusters.get(canonicalKey)
        if (!acc) {
          acc = { reviewIds: new Set(), surfaceCounts: new Map(), quotes: new Map() }
          clusters.set(canonicalKey, acc)
        }
        acc.reviewIds.add(reviewId)
        acc.surfaceCounts.set(surfaceForm, (acc.surfaceCounts.get(surfaceForm) ?? 0) + 1)
        if (!acc.quotes.has(surfaceForm)) acc.quotes.set(surfaceForm, text)
      }
    }
  }

  interface Candidate {
    canonicalKey: string
    surface:      string
    reviewCount:  number
    reviewIds:    string[]
    exampleQuote: string
  }

  const candidates: Candidate[] = Array.from(clusters.entries())
    .filter(([, acc]) => acc.reviewIds.size >= minCount)
    .map(([canonicalKey, acc]) => {
      const topSurface = Array.from(acc.surfaceCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
      return {
        canonicalKey,
        surface:      topSurface,
        reviewCount:  acc.reviewIds.size,
        reviewIds:    Array.from(acc.reviewIds),
        exampleQuote: acc.quotes.get(topSurface)!,
      }
    })

  // Drop shorter n-grams whose word SET is a subset of a longer, near-identical
  // (by review overlap) cluster's word set — "big capsule" vs "too big
  // capsule" reporting as two near-duplicate themes when they're the same
  // underlying complaint. Set-subset, not string-substring, because
  // canonicalKey is now sorted (order-independent).
  const wordSet = (key: string) => new Set(key.split(' '))
  const isSubset = (a: Set<string>, b: Set<string>) => Array.from(a).every(w => b.has(w))

  candidates.sort((a, b) => b.canonicalKey.length - a.canonicalKey.length || b.reviewCount - a.reviewCount)
  const kept: Candidate[] = []
  const keptWordSets: Set<string>[] = []
  for (const c of candidates) {
    const cWords = wordSet(c.canonicalKey)
    const dominated = kept.some((k, idx) => {
      if (!isSubset(cWords, keptWordSets[idx])) return false
      const overlap = c.reviewIds.filter(id => k.reviewIds.includes(id)).length
      return overlap / c.reviewIds.length >= 0.7
    })
    if (!dominated) {
      kept.push(c)
      keptWordSets.push(cWords)
    }
  }

  return kept
    .map(c => ({
      label:        c.surface,
      reviewCount:  c.reviewCount,
      reviewIds:    c.reviewIds,
      exampleQuote: c.exampleQuote,
    }))
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, 10)
}
