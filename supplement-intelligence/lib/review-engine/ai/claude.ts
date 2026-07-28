import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, AICompletionOptions, AICompletionResult } from './types'

// Anthropic/Claude implementation of the provider-agnostic AIProvider interface.
// To swap in GPT-4o, Gemini, or a local model, implement AIProvider in a new file
// and update ai/registry.ts — nothing else needs to change.

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude'
  private client: Anthropic
  private model:  string

  constructor(apiKey?: string, model = 'claude-sonnet-4-6') {
    // maxRetries: 0 — retry policy is owned entirely by completeWithRetry
    // below (bounded, classified), not stacked on top of the SDK's own
    // hidden retries, so worst-case HTTP attempts are exactly its cap.
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
    this.model  = model
  }

  // Bounded retry + error classification (llm-cost-rate-governance):
  //   - transient failures (429 / 5xx / overloaded) retry with backoff,
  //     at most 3 total attempts — never indefinite;
  //   - credit exhaustion (400 "credit balance...") NEVER retries (it
  //     cannot succeed) and re-throws as a classified, user-showable
  //     message — this repo has had a real production incident of exactly
  //     this failure mode;
  //   - anything else propagates unchanged.
  private async completeWithRetry(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    const MAX_ATTEMPTS = 3
    const BACKOFF_MS = [1_000, 3_000]
    let lastErr: unknown
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await this.client.messages.create(params)
      } catch (e: unknown) {
        lastErr = e
        const status = (e as { status?: number }).status
        const msg = e instanceof Error ? e.message : String(e)
        if (status === 400 && /credit balance/i.test(msg)) {
          throw new Error('AI provider credits exhausted — review analysis unavailable until the account is topped up.')
        }
        const isTransient = status === 429 || (status !== undefined && status >= 500) || /overloaded/i.test(msg)
        if (!isTransient || attempt === MAX_ATTEMPTS - 1) break
        await new Promise(r => setTimeout(r, BACKOFF_MS[attempt] ?? 3_000))
      }
    }
    const status = (lastErr as { status?: number }).status
    if (status === 429) {
      throw new Error('AI provider rate limit reached — please try again in a minute.')
    }
    throw lastErr
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    // llm-cost-rate-governance retrofit (2026-07-28, item ג — this call site
    // predates the policy): bounded retry with backoff on transient
    // failures (429/5xx/overloaded), never indefinite; rate/credit
    // exhaustion surfaces as a classified error message the caller can
    // show honestly instead of a raw SDK throw. Success path byte-identical.
    const response = await this.completeWithRetry({
      model:      this.model,
      max_tokens: options.max_tokens  ?? 2048,
      temperature: options.temperature ?? 0.1,
      ...(options.system ? { system: options.system } : {}),
      messages: options.messages.map(m => ({
        role:    m.role,
        content: m.content,
      })),
    })

    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    return {
      content,
      usage: {
        input_tokens:  response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    }
  }
}
