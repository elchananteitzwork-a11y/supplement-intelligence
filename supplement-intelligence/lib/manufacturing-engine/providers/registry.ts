import { ApifyProvider }             from './apify'
import { AIManufacturingProvider }   from './ai'
import type { ManufacturingProvider } from '../types'

// Provider registry — ordered by data quality preference.
// Engine tries each in order and returns the first successful result.
//
// Phase 2: Apify Xtracto Alibaba Products Search Scraper (requires APIFY_API_TOKEN).
//          Returns null when credential is absent → falls through to AI estimate.
// Phase 1: AI synthesis fallback — always available.
export const manufacturingProviders: ManufacturingProvider[] = [
  new ApifyProvider(),
  new AIManufacturingProvider(),
  // new MadeInChinaProvider(),   // Phase 3
  // new GlobalSourcesProvider(), // Phase 3
]
