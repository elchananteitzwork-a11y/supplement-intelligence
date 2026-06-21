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
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY })
    this.model  = model
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const response = await this.client.messages.create({
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
