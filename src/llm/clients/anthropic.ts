import type { LLMClientInterface, LLMMessage, LLMResponse, GenerateOptions } from '../types.js';

export class AnthropicClient implements LLMClientInterface {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly defaultTemperature: number;
  private readonly defaultMaxTokens: number;

  constructor(config: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
    this.defaultTemperature = config.temperature ?? 0;
    this.defaultMaxTokens = config.maxTokens ?? 8192;
  }

  async generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMResponse> {
    // Anthropic requires system messages to be passed separately
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      temperature: options?.temperature ?? this.defaultTemperature,
      messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content })),
    };

    if (systemMessages.length > 0) {
      body.system = systemMessages.map((m) => m.content).join('\n\n');
    }

    // For structured output, instruct via system prompt (Anthropic doesn't have native JSON schema mode)
    if (options?.jsonSchema) {
      const schemaInstruction = `\n\nYou MUST respond with a valid JSON object matching this exact schema:\n${JSON.stringify(options.jsonSchema, null, 2)}\n\nRespond with ONLY the JSON object, no markdown fencing or explanation.`;
      body.system = ((body.system as string) ?? '') + schemaInstruction;
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any;
    const content = data.content?.[0]?.text ?? '';

    return {
      content,
      usage: data.usage ? {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      } : undefined,
    };
  }
}
