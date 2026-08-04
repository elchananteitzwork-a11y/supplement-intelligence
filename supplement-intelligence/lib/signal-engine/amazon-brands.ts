// ── Amazon house brands — docs/RD_WOUNDED_LEADER_AMAZON_PRESENCE.md ─────────
//
// Curated, human-reviewed data file (same precedent as lib/science-engine/
// ingredient-vocabulary.ts): Amazon's own private-label brands relevant to
// supplements/health, for the Amazon First-Party Presence signal. Exact
// brand-string match only — false positives are essentially impossible;
// false negatives are (a disclosed best-effort list; additions are one-line
// data PRs).
//
// Research basis (2026-08-04, research-evidence-agent, live-confirmed where
// noted): Amazon Elements (30+ supplement SKUs, live store page) and Solimo
// (91 SKUs incl. a dedicated Vitamins & Supplements node, live) actively
// sell supplements today; Amazon Basics sells supplements in practice (our
// own live Keepa probe: creatine monohydrate, ~9,000/mo); Revly was folded
// into Amazon Elements ("Previously Revly" on live product pages) — kept as
// an alias, not a separate brand. Happy Belly (grocery), Amazon Basic Care
// (OTC pharma), and Mama Bear (baby/kids) are adjacent lines included for
// coverage. The 2023 private-label purge (WSJ via CNBC) killed clothing and
// furniture lines, not consumables.

export interface AmazonBrand {
  canonical: string
  aliases:   string[]
}

export const AMAZON_BRANDS: AmazonBrand[] = [
  { canonical: 'amazon basics',    aliases: ['amazonbasics'] },
  { canonical: 'amazon elements',  aliases: ['revly'] },
  { canonical: 'solimo',           aliases: [] },
  { canonical: 'happy belly',      aliases: [] },
  { canonical: 'amazon basic care', aliases: ['basic care'] },
  { canonical: 'mama bear',        aliases: [] },
]

// Exact, case/whitespace-insensitive match — same discipline as
// matchTrackedIngredient: match or nothing, never a guess.
export function matchAmazonBrand(brand: string): string | null {
  const b = brand.trim().toLowerCase()
  if (!b) return null
  for (const entry of AMAZON_BRANDS) {
    if (b === entry.canonical || entry.aliases.includes(b)) return entry.canonical
  }
  return null
}
