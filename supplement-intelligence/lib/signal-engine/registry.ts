import { SignalEngine }              from './engine'
import { KeepaProvider }             from './providers/keepa'
import { GoogleTrendsProvider }      from './providers/google-trends'
import { DataForSeoTrendsProvider }  from './providers/dataforseo-trends'
import { TikTokProvider }            from './providers/tiktok'
import { RedditProvider }            from './providers/reddit'
import { MetaAdsProvider }           from './providers/meta-ads'
import { CompetitionSignalProvider } from './providers/competition'
import { ScienceProvider }           from './providers/science'

// To add a new provider:
//   1. Implement SignalProvider in providers/<name>.ts
//   2. Import it here
//   3. Instantiate and add it to the array below
//   Nothing else needs to change — the engine and routes pick it up automatically.

// Roadmap M2.14: DataForSeoTrendsProvider is registered but disabled by
// default (DATAFORSEO_TRENDS_ENABLED unset) — coexists with the live
// GoogleTrendsProvider without affecting any real analysis until
// explicitly enabled for validation.
const providers = [
  new KeepaProvider(),
  new GoogleTrendsProvider(),
  new DataForSeoTrendsProvider(),
  new TikTokProvider(),
  new RedditProvider(),
  new MetaAdsProvider(),
  new CompetitionSignalProvider(),
  new ScienceProvider(),
]

// Singleton engine used by all API routes.
export const signalEngine = new SignalEngine(providers)
