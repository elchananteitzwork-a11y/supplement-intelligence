import type { SignalProvider, ProviderSignals } from '../types'

// Google Trends provider stub.
// When implemented, this provider will:
//   - Call the Google Trends API (or an unofficial endpoint / SerpAPI)
//   - Return demand.trend (YoY direction), growth.yoy_change, growth.momentum
//   - Compare trend interest for the supplement category keyword vs. 12 months ago
//
// Required env vars (once implemented):
//   GOOGLE_TRENDS_API_KEY  — or SERPAPI_KEY if routed through SerpAPI
//
// Dimensions this provider will cover when live:
//   demand     — trend direction + interest level as a proxy for search_volume
//   growth     — YoY momentum from Google search interest change
//   seasonality — seasonal index from monthly interest breakdown

export class GoogleTrendsProvider implements SignalProvider {
  readonly name    = 'google-trends'
  readonly enabled = false   // flip to !!process.env.GOOGLE_TRENDS_API_KEY when implemented

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetch(_category: string): Promise<ProviderSignals | null> {
    return null
  }
}
