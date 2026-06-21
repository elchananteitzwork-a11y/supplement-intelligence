import type { SignalProvider, ProviderSignals } from '../types'

// TikTok provider stub.
// When implemented, this provider will:
//   - Call the TikTok Research API (or a scraper service like ScrapingBee/Apify)
//   - Search for supplement category hashtags and video counts
//   - Measure creator diversity, view velocity, and comment purchase-intent signals
//
// Required env vars (once implemented):
//   TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET  — TikTok Research API credentials
//
// Dimensions this provider will cover when live:
//   virality   — tiktok, content_potential, ugc (direct measurement)
//   demand     — trending hashtag volume as a consumer interest proxy
//   growth     — 30-day vs. 90-day hashtag view growth rate

export class TikTokProvider implements SignalProvider {
  readonly name    = 'tiktok'
  readonly enabled = false   // flip to !!(process.env.TIKTOK_CLIENT_KEY) when implemented

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetch(_category: string): Promise<ProviderSignals | null> {
    return null
  }
}
