// ── Problem-topic taxonomy — Roadmap M2.7 ────────────────────────────────────
//
// V2 Blueprint §6 (repoint): "Repurpose Reddit toward problem-cluster
// discovery... productizes what VOC research proved manually." Each topic's
// keyword patterns are informed by, and named after, the 8 real problem
// clusters already identified by this project's own manual VOC research
// (voc_problem_clusters.md — Google Search/health-forums/trend-report
// research, not Reddit-derived) — the validation anchor the roadmap's own
// acceptance criterion asks for is that this pipeline's automated,
// keyword-matched clustering of REAL Reddit posts independently surfaces
// at least one of these same themes, not that the language is copied
// verbatim (the manual research's own methodology note says Reddit access
// was blocked for it at the time, so there is no verbatim Reddit text to
// copy from).
//
// Deterministic, not AI-assigned: every post is assigned to a topic purely
// by real regex keyword matches against its own real title/selftext — no
// model call, no invented score. This is the same category of technique as
// reddit.ts's existing PAIN_PATTERNS (kept as a separate, per-query concern
// there; not reused directly here since that list's job is "does this post
// show pain language at all," not "which of several named problem themes
// does it belong to").

export interface ProblemTopic {
  key:      string
  label:    string
  keywords: RegExp[]
}

export const PROBLEM_TOPICS: ProblemTopic[] = [
  {
    key: 'perimenopause_hormonal',
    label: 'Perimenopause / hormonal collapse',
    keywords: [
      /\bperimenopause\b/i, /\bmenopause\b/i, /\bhot flash(es)?\b/i,
      /\bbrain fog\b/i, /\bhormonal (weight|imbalance)\b/i,
    ],
  },
  {
    key: 'blood_sugar_energy',
    label: 'Blood sugar / energy crash',
    keywords: [
      /\bblood sugar\b/i, /\bsugar crash\b/i, /\bafternoon (crash|slump)\b/i,
      /\bsugar cravings?\b/i, /\benergy crash\b/i,
    ],
  },
  {
    key: 'cortisol_sleep',
    label: 'Cortisol / stress-driven sleep issues',
    keywords: [
      /\bcortisol\b/i, /\bcan'?t sleep\b/i, /\bwired (but|and) tired\b/i,
      /\bmelatonin (doesn'?t|isn'?t) work/i, /\binsomnia\b/i,
    ],
  },
  {
    key: 'gut_skin_inflammation',
    label: 'Gut-skin-inflammation triangle',
    keywords: [
      /\bgut health\b/i, /\bbloat(ing|ed)?\b/i, /\bacne\b/i, /\brosacea\b/i,
      /\bgut.?skin\b/i, /\bleaky gut\b/i,
    ],
  },
  {
    key: 'stubborn_weight_gain',
    label: 'Eating well but still gaining weight',
    keywords: [
      /\bcan'?t lose weight\b/i, /\bstubborn (belly )?fat\b/i,
      /\bgaining weight\b.*\b(healthy|diet|exercis)/i, /\bweight gain resistance\b/i,
    ],
  },
  {
    key: 'pet_inflammation',
    label: 'Pet inflammation (skin/gut/anxiety)',
    keywords: [
      /\bdog\b.{0,25}\b(itch|scratch)/i, /\bcat\b.{0,25}\b(itch|scratch)/i,
      /\b(dog|cat|pet)\b.{0,25}\ballerg/i,
      /\bdog anxiety\b/i, /\bpet (gut|probiotic)/i,
    ],
  },
  {
    key: 'fitness_plateau_recovery',
    label: 'Fitness plateau & recovery gap',
    keywords: [
      /\bplateau(ed|ing)?\b/i, /\bcreatine\b/i, /\bmuscle soreness\b/i,
      /\brecovery (gap|issue)/i, /\bnot (seeing|making) (gains|progress)\b/i,
    ],
  },
  {
    key: 'stress_hair_loss',
    label: 'Stress-driven hair loss',
    keywords: [
      /\bhair loss\b/i, /\bhair thinning\b/i, /\bshedding (hair)?\b/i,
      /\bbiotin\b/i, /\btelogen effluvium\b/i,
    ],
  },
]
