import type { LLMClientInterface, LLMMessage, LLMResponse, GenerateOptions } from '../types.js';

export class OpenAIClient implements LLMClientInterface {
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
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.defaultTemperature = config.temperature ?? 0;
    this.defaultMaxTokens = config.maxTokens ?? 8192;
  }

  async generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? this.defaultTemperature,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
    };

    if (options?.jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'extraction_result',
          strict: true,
          schema: options.jsonSchema,
        },
      };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content ?? '',
      usage: data.usage ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      } : undefined,
    };
  }
}
