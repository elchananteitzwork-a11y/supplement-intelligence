// ── Provider-agnostic AI interface ────────────────────────────────────────
// Any LLM (Claude, GPT, Gemini, Llama) can be wired in by implementing
// AIProvider. The rest of the engine never touches a vendor SDK directly.

export interface AIMessage {
  role:    'user' | 'assistant'
  content: string
}

export interface AICompletionOptions {
  system?:      string
  messages:     AIMessage[]
  max_tokens?:  number
  temperature?: number
}

export interface AIUsage {
  input_tokens:  number
  output_tokens: number
}

export interface AICompletionResult {
  content: string
  usage?:  AIUsage
}

export interface AIProvider {
  readonly name: string
  complete(options: AICompletionOptions): Promise<AICompletionResult>
}
