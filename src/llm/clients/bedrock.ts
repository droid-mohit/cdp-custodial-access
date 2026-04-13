import type { LLMClientInterface, LLMMessage, LLMResponse, GenerateOptions } from '../types.js';

export class BedrockClient implements LLMClientInterface {
  private readonly model: string;
  private readonly region: string;
  private readonly defaultTemperature: number;
  private readonly defaultMaxTokens: number;

  constructor(config: {
    model: string;
    region?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    this.model = config.model;
    this.region = config.region ?? 'us-east-1';
    this.defaultTemperature = config.temperature ?? 0;
    this.defaultMaxTokens = config.maxTokens ?? 8192;
  }

  async generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMResponse> {
    // Bedrock Converse API uses the same message format as Anthropic
    // but requires AWS SDK for signing
    let awsSdk: any;
    try {
      // @ts-ignore — optional dependency, loaded at runtime only
      awsSdk = await import('@aws-sdk/client-bedrock-runtime');
    } catch {
      throw new Error(
        'AWS SDK not installed. Install it with: npm install @aws-sdk/client-bedrock-runtime'
      );
    }

    const client = new awsSdk.BedrockRuntimeClient({ region: this.region });

    // Separate system messages
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    let systemText = systemMessages.map((m) => m.content).join('\n\n');

    // For structured output, append schema instruction to system
    if (options?.jsonSchema) {
      systemText += `\n\nYou MUST respond with a valid JSON object matching this exact schema:\n${JSON.stringify(options.jsonSchema, null, 2)}\n\nRespond with ONLY the JSON object, no markdown fencing or explanation.`;
    }

    const converseMessages = nonSystemMessages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: [{ text: m.content }],
    }));

    const input: Record<string, unknown> = {
      modelId: this.model,
      messages: converseMessages,
      inferenceConfig: {
        maxTokens: options?.maxTokens ?? this.defaultMaxTokens,
        temperature: options?.temperature ?? this.defaultTemperature,
      },
    };

    if (systemText) {
      input.system = [{ text: systemText }];
    }

    const command = new awsSdk.ConverseCommand(input);
    const response = await client.send(command);

    const content = response.output?.message?.content?.[0]?.text ?? '';

    return {
      content,
      usage: response.usage ? {
        inputTokens: response.usage.inputTokens ?? 0,
        outputTokens: response.usage.outputTokens ?? 0,
      } : undefined,
    };
  }
}
