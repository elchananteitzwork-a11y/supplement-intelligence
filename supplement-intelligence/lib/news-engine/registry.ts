import { NewsEngine } from './engine'
import { OpenFdaProvider } from './providers/openfda'
import { PubMedProvider } from './providers/pubmed'
import { GdeltProvider } from './providers/gdelt'

// Modular by construction — adding, removing, or reordering a provider here
// is the only change needed; nothing else in the pipeline knows which
// providers exist. PR Newswire/Business Wire/GlobeNewswire RSS were
// evaluated (all return real, syndication-friendly feeds) but deprioritized
// for v1: GDELT's crawl already indexes wire-service-originated stories
// when they get picked up, so a raw firehose-keyword-filter provider would
// add real complexity for low incremental coverage. Easy to add later as a
// fourth provider without touching this file's callers.
const providers = [
  new OpenFdaProvider(),
  new PubMedProvider(),
  new GdeltProvider(),
]

export const newsEngine = new NewsEngine(providers)
