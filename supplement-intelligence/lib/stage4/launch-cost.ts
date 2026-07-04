// ── True Launch Cost Model ────────────────────────────────────────────────
// Bottom-up estimate for supplement product launch capital requirements.
// All figures are category-based estimates; none are real quotes.
// Founders must validate against actual supplier quotes and Amazon fee schedules.

import type { Stage1Evidence } from '../evidence/adapter'
import type { PpcEconomics } from '../stage1/ppc-economics'

export type CapitalRiskLevel = 'Low' | 'Medium' | 'High' | 'Extreme'

export interface LaunchCostScenario {
  label: 'minimum' | 'conservative' | 'aggressive'

  // Inputs used
  moq_units:         number
  est_cogs_per_unit: number   // % of price → dollar amount

  // Component breakdown (all in USD)
  first_inventory_order:       number   // MOQ × est_cogs_per_unit
  amazon_fba_prep_shipping:    number   // $0.50/unit inbound + prep
  product_testing_compliance:  number   // COA, heavy metals, third-party lab
  photography_creative:        number   // main image + lifestyle shots
  a_plus_content:              number   // A+ content design
  amazon_vine:                 number   // $200/ASIN (fixed)
  initial_ppc_budget:          number   // launch-phase ad spend
  contingency:                 number   // 10–15% buffer

  total:              number
  capital_risk_level: CapitalRiskLevel
  notes:              string[]
}

export interface LaunchCostModel {
  minimum:      LaunchCostScenario
  conservative: LaunchCostScenario
  aggressive:   LaunchCostScenario

  price:                 number
  est_cogs_pct_of_price: number   // 20–30%
  undercapitalized_at:   number   // = minimum.total

  assumptions:  string[]
  limitations:  string[]
}

function buildScenario(
  label:  'minimum' | 'conservative' | 'aggressive',
  price:  number,
  fbaFee: number,
): LaunchCostScenario {
  // COGS estimate: supplement capsules/softgels from Alibaba
  const cogsPct = label === 'minimum' ? 0.20 : label === 'conservative' ? 0.25 : 0.30
  const cogsCents = Math.round(price * cogsPct * 100) / 100

  const moq = label === 'minimum' ? 500 : label === 'conservative' ? 1000 : 2000

  const inventory  = Math.round(moq * cogsCents)
  const fbaPrep    = Math.round(moq * 0.50)   // $0.50/unit inbound + prep

  const testingCompliance =
    label === 'minimum'     ? 500   :
    label === 'conservative'? 1500  : 3000

  const photography =
    label === 'minimum'     ? 800   :
    label === 'conservative'? 1500  : 2500

  const aplusContent =
    label === 'minimum'     ? 300   :
    label === 'conservative'? 800   : 1500

  const vine = 200  // Amazon Vine fixed fee per ASIN

  const ppcBudget =
    label === 'minimum'     ? 500   :
    label === 'conservative'? 1500  : 5000

  const subtotal = inventory + fbaPrep + testingCompliance + photography + aplusContent + vine + ppcBudget

  const contingencyPct = label === 'minimum' ? 0.10 : label === 'conservative' ? 0.12 : 0.15
  const contingency = Math.round(subtotal * contingencyPct)

  const total = subtotal + contingency

  const capitalRisk: CapitalRiskLevel =
    total > 50_000 ? 'Extreme' :
    total > 25_000 ? 'High'    :
    total > 10_000 ? 'Medium'  : 'Low'

  const notes: string[] = [
    `MOQ: ${moq.toLocaleString()} units × $${cogsCents.toFixed(2)} est. COGS = $${inventory.toLocaleString()} inventory`,
    `Testing: ${label === 'minimum' ? 'basic COA only' : label === 'conservative' ? 'COA + heavy metals + third-party lab' : 'COA + heavy metals + NSF/USP-level cert'}`,
    `PPC: ${label === 'minimum' ? '1 month lean launch' : label === 'conservative' ? '2 month standard launch' : '3 month aggressive ranking push'}`,
    label === 'aggressive' ? '30% COGS assumes premium ingredients or clinical dosing' : '',
  ].filter(Boolean)

  return {
    label,
    moq_units:                  moq,
    est_cogs_per_unit:          cogsCents,
    first_inventory_order:      inventory,
    amazon_fba_prep_shipping:   fbaPrep,
    product_testing_compliance: testingCompliance,
    photography_creative:       photography,
    a_plus_content:             aplusContent,
    amazon_vine:                vine,
    initial_ppc_budget:         ppcBudget,
    contingency,
    total,
    capital_risk_level:         capitalRisk,
    notes,
  }
}

export function computeLaunchCost(
  evidence: Stage1Evidence,
  _ppcEcon?: PpcEconomics | null,
): LaunchCostModel {
  const price  = evidence.median_price?.value ?? 0
  const fbaFee = evidence.avg_fba_fee?.value ?? 4.50

  return {
    minimum:      buildScenario('minimum', price, fbaFee),
    conservative: buildScenario('conservative', price, fbaFee),
    aggressive:   buildScenario('aggressive', price, fbaFee),
    price,
    est_cogs_pct_of_price: 25,
    undercapitalized_at: buildScenario('minimum', price, fbaFee).total,
    assumptions: [
      price === 0
        ? 'Price: $0 — NO PRICE DATA AVAILABLE. All scenario totals are zero and must not be used for decisions.'
        : `Price: $${price} (Stage 1 Apify primary measurement)`,
      'COGS estimate: 20–30% of retail price (supplement capsules/softgels from Alibaba at MOQ 500–2,000 units)',
      'FBA inbound + prep: $0.50/unit (industry standard for small-parcel supplements)',
      'Testing & compliance: $500 (basic COA) to $3,000 (NSF/USP-level third-party cert) — supplement-specific',
      'Photography: $800–$2,500 (main image + lifestyle shots + label close-up)',
      'A+ content: $300–$1,500 (infographics + comparison module)',
      'Amazon Vine: $200/ASIN (30-review launch program — fixed fee)',
      'Initial PPC: $500–$5,000 (1–3 month launch-phase ad spend)',
      'Contingency: 10–15% of subtotal for overruns and unexpected costs',
    ],
    limitations: [
      'COGS is a category estimate — requires real supplier quotes from Alibaba or CM before decision',
      'Does not include: trademark/brand registry ($250–$800), liability insurance (~$500/yr), storage fees beyond month 3',
      'PPC budget assumes a standard launch — higher-competition markets may need 2–3× for ranking velocity',
      'Regulatory costs may be higher for clinical health claims, specific ingredients, or international markets',
      'No Alibaba MOQ data integration — real minimum order quantities vary by supplier and formula complexity',
      price === 0 ? 'WARNING: No price data available — all estimates use $0 price, which understates real costs' : '',
    ].filter(Boolean),
  }
}
