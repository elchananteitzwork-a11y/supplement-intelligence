import type { SignalProvider, ProviderSignals } from '../types'

// Meta Ads provider stub.
// When implemented, this provider will:
//   - Call the Meta Marketing API (Audience Insights / Ads Delivery Insights)
//   - Estimate audience size for supplement category interest targeting
//   - Infer content_potential and ugc from ad engagement benchmarks
//   - Measure CPM trends as a demand proxy (rising CPM = increasing advertiser competition)
//
// Required env vars (once implemented):
//   META_ADS_ACCESS_TOKEN  — long-lived system user token with ads_read scope
//   META_ADS_ACCOUNT_ID    — ad account ID for API scope
//
// Dimensions this provider will cover when live:
//   virality    — audience size and engagement benchmark as content potential proxy
//   competition — CPM trend and number of active advertisers in the category
//   pricing     — CPM/CPC benchmarks inform expected customer acquisition cost

export class MetaAdsProvider implements SignalProvider {
  readonly name    = 'meta-ads'
  readonly enabled = false   // flip to !!(process.env.META_ADS_ACCESS_TOKEN) when implemented

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetch(_category: string): Promise<ProviderSignals | null> {
    return null
  }
}
