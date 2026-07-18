// Regression tests for the 2026-07-17 live-audit bug fixes:
//   Finding 2 (Critical) — CAERS `date_started` field name + CAERS/FAERS label
//   Finding 1 (Critical) — SUSPECT-vs-CONCOMITANT causal-implication filtering
//   Finding 3 (Medium)   — recall total undercount (metaTotal vs page sum)
// ...plus the 2026-07-18 coordinated follow-up fixes:
//   Finding 1 (High)        — sample limit raised 100/25 -> real openFDA max 1000
//   Finding 2 (Medium-High) — `serious_reports` (fake `serious:1` field, always
//                              404s) replaced with an honest implicated-subset proxy
//
// No live network calls — mocked global fetch, matching this codebase's
// established convention (see manufacturer-credibility.test.ts). Fixtures
// are modeled on REAL, live-confirmed openFDA response shapes captured
// during the 2026-07-17 audit (real `products[].role`/`name_brand`,
// `outcomes`, `reactions`, `date_started` fields on /food/event.json; real
// `reason_for_recall` text from the 4 real Class I "magnesium" matches,
// none of which actually mention magnesium — confirmed live).
// provider-cache is not mocked: in the test environment SUPABASE_* env vars
// are absent, so cacheGet/cacheSet are real no-ops, exactly like production
// behaves with caching disabled.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchRegulatoryIntelligence } from '../index'

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response
}

function notFound(): Response {
  return { ok: false, status: 404, json: () => Promise.resolve({ error: { code: 'NOT_FOUND' } }) } as Response
}

// Real-shaped CAERS (/food/event.json) sample, modeled on the live
// 2026-07-17 GET https://api.fda.gov/food/event.json?search=products.name_brand:magnesium
// response — real `products[].role`, `name_brand`, `industry_name`, real
// `outcomes`/`reactions` array shapes.
const CAERS_SAMPLE_RESULTS = [
  {
    report_number: '130193-implicated-hosp',
    outcomes: ['Hospitalization'],
    reactions: ['NAUSEA'],
    products: [
      { role: 'SUSPECT', name_brand: 'SLOW-MAG (MAGNESIUM, CALCIUM) TABLET', industry_code: '54', industry_name: 'Vit/Min/Prot/Unconv Diet(Human/Animal)' },
    ],
  },
  {
    // Real-shaped conflation case: magnesium present only as CONCOMITANT —
    // niacin is the actual SUSPECT product. Must NOT count toward
    // hospitalization_count/implicated_reports (Finding 1).
    report_number: '130193-concomitant-hosp',
    outcomes: ['Hospitalization'],
    reactions: ['FLUSHING'],
    products: [
      { role: 'SUSPECT', name_brand: 'SUNDOWN NIACIN 500 MG TIME RELEASE CAPLETS', industry_code: '54', industry_name: 'Vit/Min/Prot/Unconv Diet(Human/Animal)' },
      { role: 'CONCOMITANT', name_brand: 'MAGNESIUM', industry_code: '54', industry_name: 'Vit/Min/Prot/Unconv Diet(Human/Animal)' },
    ],
  },
  {
    report_number: '2019-implicated-death',
    outcomes: ['Death'],
    reactions: ['CARDIAC ARREST'],
    products: [
      { role: 'SUSPECT', name_brand: 'MAGNESIUM CITRATE POWDER', industry_code: '54', industry_name: 'Vit/Min/Prot/Unconv Diet(Human/Animal)' },
    ],
  },
  {
    // Real-shaped conflation case: magnesium only CONCOMITANT to an
    // unrelated fatal event. Must NOT count toward death_count (Finding 1).
    report_number: '2019-concomitant-death',
    outcomes: ['Death'],
    reactions: ['ANAPHYLAXIS'],
    products: [
      { role: 'SUSPECT', name_brand: 'ECHINACEA EXTRACT', industry_code: '54', industry_name: 'Vit/Min/Prot/Unconv Diet(Human/Animal)' },
      { role: 'CONCOMITANT', name_brand: 'KIRKLAND MATURE MULTI AND MINERAL', industry_code: '54', industry_name: 'Vit/Min/Prot/Unconv Diet(Human/Animal)' },
    ],
  },
]

// Real reason_for_recall text from the 4 REAL live-confirmed Class I
// "magnesium" matches (GET food/enforcement.json?search=product_description:
// "magnesium" AND classification:"Class I", captured 2026-07-17) — none of
// these actually mention magnesium; magnesium was a minor excipient mention
// in the matched product_description only.
const RECALL_SAMPLE_RESULTS = [
  {
    classification: 'Class I',
    product_description: 'SP Standard Process, Cataplex C, Dietary Supplement, Proprietary Blend: Veal bone PMG extract, magnesium stearate...',
    reason_for_recall: 'Standard Process, Inc. is voluntarily recalling 3 dietary supplements due to potential Salmonella contamination.',
  },
  {
    classification: 'Class I',
    product_description: 'Gorilla Mind Rauwolscine Dietary Supplement... Other ingredients: magnesium stearate.',
    reason_for_recall: 'Product was recalled due to the potential for contamination with Salmonella',
  },
  {
    classification: 'Class I',
    product_description: 'CLIF BAR Sierra Trail Mix; INGREDIENTS: ... magnesium oxide (trace mineral)...',
    reason_for_recall: 'Firm was notified by supplier of sunflower kernels that they may be contaminated with Listeria monocytogenes.',
  },
  {
    // The one real-shaped record where the recall IS actually about
    // magnesium — reason_for_recall names it directly. Must be the only one
    // counted as implicated.
    classification: 'Class II',
    product_description: 'Dynamite Specialty Products Tri-Mins Daily Foundation, calcium, magnesium, potassium dietary supplement.',
    reason_for_recall: 'Recalled due to incorrect magnesium content exceeding labeled amount.',
  },
]

function mockOpenfda(overrides: {
  caersTotal?: number
  caersResults?: unknown[]
  recentTotal?: number
  recallTotal?: number
  recallResults?: unknown[]
} = {}) {
  const {
    caersTotal = CAERS_SAMPLE_RESULTS.length,
    caersResults = CAERS_SAMPLE_RESULTS,
    recentTotal = 0,
    recallTotal = RECALL_SAMPLE_RESULTS.length,
    recallResults = RECALL_SAMPLE_RESULTS,
  } = overrides

  return vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = input.toString()

    if (url.includes('food/enforcement.json')) {
      return Promise.resolve(jsonResponse({
        meta: { results: { skip: 0, limit: 25, total: recallTotal } },
        results: recallResults,
      }))
    }
    if (url.includes('food/event.json')) {
      if (url.includes('date_started')) {
        return Promise.resolve(jsonResponse({
          meta: { results: { skip: 0, limit: 1, total: recentTotal } },
          results: [],
        }))
      }
      return Promise.resolve(jsonResponse({
        meta: { results: { skip: 0, limit: 1000, total: caersTotal } },
        results: caersResults,
      }))
    }
    return Promise.resolve(notFound())
  })
}

describe('fetchRegulatoryIntelligence — Finding 2 (date_started field + CAERS trend)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('queries the real `date_started` field, not the fake `date_started_mfr`', async () => {
    const fetchSpy = mockOpenfda()
    await fetchRegulatoryIntelligence('magnesium supplement')

    const calledUrls = fetchSpy.mock.calls.map(c => c[0]!.toString())
    const recentCall = calledUrls.find(u => u.includes('food/event.json') && u.includes('date_started'))
    expect(recentCall).toBeDefined()
    expect(recentCall).toContain('date_started%3A')
    expect(recentCall).not.toContain('date_started_mfr')
  })

  it('does not hard-code recent_trend to Decreasing — real recent data yields Increasing', async () => {
    // 10 total (>= the >=10 threshold in classifyRisk trend logic) with a
    // high recent share relative to total to cross the real 25% threshold.
    mockOpenfda({
      caersTotal: 10,
      caersResults: CAERS_SAMPLE_RESULTS,
      recentTotal: 5, // 5/10 = 50% > 25% → 'Increasing'
    })

    const result = await fetchRegulatoryIntelligence('magnesium supplement')
    expect(result?.adverse_events?.recent_trend).toBe('Increasing')
  })

  it('yields Decreasing (not by hard-coding, but real low-recent-share data)', async () => {
    mockOpenfda({ caersTotal: 100, caersResults: CAERS_SAMPLE_RESULTS, recentTotal: 2 }) // 2%
    const result = await fetchRegulatoryIntelligence('magnesium supplement')
    expect(result?.adverse_events?.recent_trend).toBe('Decreasing')
  })
})

describe('fetchRegulatoryIntelligence — Finding 1 (SUSPECT vs CONCOMITANT causal implication)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('counts adverse events only where the ingredient is the SUSPECT product, not merely CONCOMITANT', async () => {
    mockOpenfda()
    const result = await fetchRegulatoryIntelligence('magnesium supplement')
    const ae = result?.adverse_events
    expect(ae).toBeDefined()
    // Raw honest total includes all 4 sample records (2 implicated + 2 concomitant-only).
    expect(ae!.total_reports).toBe(4)
    // Only the 2 SUSPECT-role, name-matched reports are implicated.
    expect(ae!.implicated_reports).toBe(2)
    expect(ae!.hospitalization_count).toBe(1)
    expect(ae!.death_count).toBe(1)
    expect(ae!.top_reactions).toContain('Nausea')
    expect(ae!.top_reactions).toContain('Cardiac arrest')
    // The concomitant-only reports' reactions must NOT appear.
    expect(ae!.top_reactions).not.toContain('Flushing')
    expect(ae!.top_reactions).not.toContain('Anaphylaxis')
  })

  it('does not classify Critical/High risk from a death that only co-occurred with the ingredient (concomitant), when no implicated death exists', async () => {
    // Only the concomitant-death and concomitant-hosp records — no
    // implicated SUSPECT-role record at all.
    mockOpenfda({
      caersTotal: 2,
      caersResults: [CAERS_SAMPLE_RESULTS[1], CAERS_SAMPLE_RESULTS[3]],
      recallResults: [],
      recallTotal: 0,
    })
    const result = await fetchRegulatoryIntelligence('magnesium supplement')
    expect(result?.adverse_events?.death_count).toBe(0)
    expect(result?.adverse_events?.hospitalization_count).toBe(0)
    expect(result?.risk_level).not.toBe('Critical')
    expect(result?.risk_level).not.toBe('High')
  })

  it('recalls: filters to reports where reason_for_recall actually names the ingredient, not just product_description', async () => {
    mockOpenfda()
    const result = await fetchRegulatoryIntelligence('magnesium supplement')
    const recalls = result?.recalls
    expect(recalls).toBeDefined()
    // Only 1 of the 4 real-shaped fixture recalls actually names magnesium
    // in its stated reason_for_recall (the other 3 are real Salmonella/
    // Listeria matches that only mention magnesium as a minor excipient in
    // product_description).
    expect(recalls!.implicated_recalls).toBe(1)
    expect(recalls!.class_i_recalls).toBe(0)   // the 3 real Class I matches are unrelated Salmonella/Listeria recalls
    expect(recalls!.class_ii_recalls).toBe(1)  // the one real, actually-magnesium-implicated recall
  })

  it('does not classify High risk from unrelated Class I recalls that never actually named the ingredient', async () => {
    mockOpenfda({
      caersResults: [], // no adverse-event data at all
      caersTotal: 0,
    })
    const result = await fetchRegulatoryIntelligence('magnesium supplement')
    // 3 real "Class I" text matches exist, but none actually implicate
    // magnesium — classification must not treat this as a High/Critical
    // regulatory risk (this directly feeds the kill-switch in
    // lib/stage3/kill-switches.ts checkFdaRegulatoryRisk).
    expect(result?.risk_level).not.toBe('Critical')
    expect(result?.risk_level).not.toBe('High')
  })
})

describe('fetchRegulatoryIntelligence — Finding 3 (recall total undercount)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('uses the real openFDA meta.total for total_recalls, not a sum of only the fetched page', async () => {
    // Real case: meta.total = 28, but only 25 (here: 4, for test brevity)
    // records are returned in the fetched page — total_recalls must reflect
    // the honest 28, not `results.length`-derived undercount.
    mockOpenfda({ recallTotal: 28, recallResults: RECALL_SAMPLE_RESULTS })
    const result = await fetchRegulatoryIntelligence('magnesium supplement')
    expect(result?.recalls?.total_recalls).toBe(28)
    expect(result?.recalls?.sample_size).toBe(RECALL_SAMPLE_RESULTS.length)
    // Discloses that classification is sample-based when the sample is
    // smaller than the honest total.
    expect(result?.warning_flags.some(f => f.includes('sample'))).toBe(true)
  })
})

describe('fetchRegulatoryIntelligence — 2026-07-18 Finding 1 (sample limit raised to real openFDA max)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('requests the real openFDA max limit=1000 for both the CAERS sample and the recall page, at zero extra requests', async () => {
    const fetchSpy = mockOpenfda()
    await fetchRegulatoryIntelligence('magnesium supplement')

    const calledUrls = fetchSpy.mock.calls.map(c => c[0]!.toString())
    const caersSampleCall = calledUrls.find(u => u.includes('food/event.json') && !u.includes('date_started'))
    const recallCall = calledUrls.find(u => u.includes('food/enforcement.json'))

    expect(caersSampleCall).toContain('limit=1000')
    expect(recallCall).toContain('limit=1000')

    // Still exactly 2 CAERS calls (sample + recent) and 1 recall call — no
    // new request was added to get the larger sample (live-confirmed
    // 2026-07-18: limit=1000 is a real, valid single request; limit=1001
    // returns a real HTTP 400 BAD_REQUEST).
    const caersCalls = calledUrls.filter(u => u.includes('food/event.json'))
    const recallCalls = calledUrls.filter(u => u.includes('food/enforcement.json'))
    expect(caersCalls).toHaveLength(2)
    expect(recallCalls).toHaveLength(1)
  })
})

describe('fetchRegulatoryIntelligence — 2026-07-18 Finding 2 (honest serious_reports proxy)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('derives serious_reports from the implicated hospitalization/death subset, not a queried field', async () => {
    mockOpenfda()
    const result = await fetchRegulatoryIntelligence('magnesium supplement')
    const ae = result?.adverse_events
    expect(ae).toBeDefined()
    // Implicated subset: 1 hospitalization + 1 death, on 2 distinct reports
    // (no double-counting a single report with both outcomes).
    expect(ae!.serious_reports).toBe(2)
    expect(ae!.serious_reports).toBe(ae!.hospitalization_count + ae!.death_count)
  })

  it('does not double-count a single implicated report that has both a hospitalization and a death outcome', async () => {
    mockOpenfda({
      caersTotal: 1,
      caersResults: [{
        report_number: 'both-outcomes',
        outcomes: ['Hospitalization', 'Death'],
        reactions: ['CARDIAC ARREST'],
        products: [
          { role: 'SUSPECT', name_brand: 'MAGNESIUM CITRATE POWDER', industry_code: '54', industry_name: 'Vit/Min/Prot/Unconv Diet(Human/Animal)' },
        ],
      }],
    })
    const result = await fetchRegulatoryIntelligence('magnesium supplement')
    expect(result?.adverse_events?.hospitalization_count).toBe(1)
    expect(result?.adverse_events?.death_count).toBe(1)
    // 1 report, not 2 — serious_reports counts implicated REPORTS, not outcomes.
    expect(result?.adverse_events?.serious_reports).toBe(1)
  })

  it('never issues a `serious:1` query (real CAERS schema has no `serious` field — live-confirmed 2026-07-18)', async () => {
    const fetchSpy = mockOpenfda()
    await fetchRegulatoryIntelligence('magnesium supplement')
    const calledUrls = fetchSpy.mock.calls.map(c => c[0]!.toString())
    expect(calledUrls.some(u => u.includes('serious'))).toBe(false)
  })
})

describe('fetchRegulatoryIntelligence — label fix (lib/stage3/adversarial.ts CAERS not FAERS)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('regulatory intelligence is sourced from CAERS (food/event.json), not FAERS (drug/event.json)', async () => {
    mockOpenfda()
    const result = await fetchRegulatoryIntelligence('magnesium supplement')
    expect(result?.data_sources.some(s => s.includes('food/event.json'))).toBe(true)
    expect(result?.data_sources.some(s => s.includes('drug/event.json'))).toBe(false)
    expect(result?.disclaimer).toContain('CAERS')
  })
})
