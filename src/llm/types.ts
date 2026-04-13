export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'bedrock';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  /** AWS region for Bedrock */
  region?: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMClientInterface {
  generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMResponse>;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: Record<string, unknown>;
}

/** Default model configurations */
export const MODEL_DEFAULTS: Record<string, { maxContextTokens: number; defaultMaxOutput: number; avgCharsPerToken: number }> = {
  // OpenAI
  'gpt-4o': { maxContextTokens: 128000, defaultMaxOutput: 16384, avgCharsPerToken: 3.5 },
  'gpt-4o-mini': { maxContextTokens: 128000, defaultMaxOutput: 16384, avgCharsPerToken: 3.5 },
  'gpt-4.1': { maxContextTokens: 1047576, defaultMaxOutput: 32768, avgCharsPerToken: 3.5 },
  'gpt-4.1-mini': { maxContextTokens: 1047576, defaultMaxOutput: 32768, avgCharsPerToken: 3.5 },
  'gpt-4.1-nano': { maxContextTokens: 1047576, defaultMaxOutput: 32768, avgCharsPerToken: 3.5 },
  'o3-mini': { maxContextTokens: 200000, defaultMaxOutput: 100000, avgCharsPerToken: 3.5 },
  // Anthropic
  'claude-sonnet-4-20250514': { maxContextTokens: 200000, defaultMaxOutput: 16384, avgCharsPerToken: 3.5 },
  'claude-haiku-4-5-20251001': { maxContextTokens: 200000, defaultMaxOutput: 8192, avgCharsPerToken: 3.5 },
  // Bedrock (same models, different IDs)
  'anthropic.claude-sonnet-4-20250514-v1:0': { maxContextTokens: 200000, defaultMaxOutput: 16384, avgCharsPerToken: 3.5 },
  'anthropic.claude-haiku-4-5-20251001-v1:0': { maxContextTokens: 200000, defaultMaxOutput: 8192, avgCharsPerToken: 3.5 },
};

/** Fallback for unknown models */
export const DEFAULT_MODEL_CONFIG = { maxContextTokens: 128000, defaultMaxOutput: 8192, avgCharsPerToken: 3.5 };
