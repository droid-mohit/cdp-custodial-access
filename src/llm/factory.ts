import type { LLMClientInterface, LLMConfig } from './types.js';
import { OpenAIClient } from './clients/openai.js';
import { AnthropicClient } from './clients/anthropic.js';
import { BedrockClient } from './clients/bedrock.js';

/** Cache key for client instances */
function cacheKey(config: LLMConfig): string {
  return `${config.provider}:${config.model}`;
}

const clientCache = new Map<string, LLMClientInterface>();

/**
 * Get or create an LLM client for the given configuration.
 * Clients are cached by provider+model to reuse connections.
 */
export function getLLMClient(config: LLMConfig): LLMClientInterface {
  const key = cacheKey(config);
  const cached = clientCache.get(key);
  if (cached) return cached;

  let client: LLMClientInterface;

  switch (config.provider) {
    case 'openai': {
      const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OpenAI API key required. Set OPENAI_API_KEY env var or pass apiKey in config.');
      client = new OpenAIClient({
        apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });
      break;
    }

    case 'anthropic': {
      const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('Anthropic API key required. Set ANTHROPIC_API_KEY env var or pass apiKey in config.');
      client = new AnthropicClient({
        apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });
      break;
    }

    case 'bedrock': {
      client = new BedrockClient({
        model: config.model,
        region: config.region,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });
      break;
    }

    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }

  clientCache.set(key, client);
  return client;
}

/** Clear the client cache (useful for testing or event loop cleanup) */
export function clearLLMClientCache(): void {
  clientCache.clear();
}
