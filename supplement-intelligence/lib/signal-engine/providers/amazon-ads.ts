import type { SignalProvider, ProviderSignals } from '../types'

// Amazon Ads provider stub.
// When implemented, this provider will:
//   - Call the Amazon Advertising API (Sponsored Products keyword research endpoint)
//   - Fetch estimated monthly search volume and suggested bid for category keywords
//   - Extract competition level from bid density and number of competing advertisers
//
// Required env vars (once implemented):
//   AMAZON_ADS_CLIENT_ID + AMAZON_ADS_CLIENT_SECRET + AMAZON_ADS_REFRESH_TOKEN
//   AMAZON_ADS_PROFILE_ID  — a valid advertising profile for scope auth
//
// Dimensions this provider will cover when live:
//   demand     — keyword monthly search volume (exact, not estimated)
//   competition — CPCs and number of competing advertisers as market saturation signal
//   pricing    — average CPC as a profitability proxy (high CPC = high-value category)

export class AmazonAdsProvider implements SignalProvider {
  readonly name    = 'amazon-ads'
  readonly enabled = false   // flip to !!(process.env.AMAZON_ADS_CLIENT_ID) when implemented

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetch(_category: string): Promise<ProviderSignals | null> {
    return null
  }
}
