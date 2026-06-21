import type { AIProvider } from './types'
import { ClaudeProvider } from './claude'

// Module-level singleton. Swap the provider once at startup and every
// engine instance in the process picks it up without re-configuration.

let _default: AIProvider | null = null

export function getDefaultAIProvider(): AIProvider {
  if (!_default) _default = new ClaudeProvider()
  return _default
}

// Call this at app startup to wire in a different LLM:
//   setDefaultAIProvider(new GPTProvider())
//   setDefaultAIProvider(new GeminiProvider())
export function setDefaultAIProvider(provider: AIProvider): void {
  _default = provider
}

export { ClaudeProvider }
