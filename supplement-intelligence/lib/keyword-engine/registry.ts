import { KeywordEngine }           from './engine'
import { DataForSeoKeywordProvider } from './dataforseo'

const providers = [
  new DataForSeoKeywordProvider(),
]

export const keywordEngine = new KeywordEngine(providers)
