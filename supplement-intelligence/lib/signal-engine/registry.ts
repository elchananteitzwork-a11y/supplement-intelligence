import { SignalEngine }              from './engine'
import { KeepaProvider }             from './providers/keepa'
import { GoogleTrendsProvider }      from './providers/google-trends'
import { TikTokProvider }            from './providers/tiktok'
import { RedditProvider }            from './providers/reddit'
import { MetaAdsProvider }           from './providers/meta-ads'
import { CompetitionSignalProvider } from './providers/competition'

// To add a new provider:
//   1. Implement SignalProvider in providers/<name>.ts
//   2. Import it here
//   3. Instantiate and add it to the array below
//   Nothing else needs to change — the engine and routes pick it up automatically.

const providers = [
  new KeepaProvider(),
  new GoogleTrendsProvider(),
  new TikTokProvider(),
  new RedditProvider(),
  new MetaAdsProvider(),
  new CompetitionSignalProvider(),
]

// Singleton engine used by all API routes.
export const signalEngine = new SignalEngine(providers)
