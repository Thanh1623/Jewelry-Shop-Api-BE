import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const LLM_PROVIDERS = {
  groq: 'groq',
  gemini: 'gemini',
  anthropic: 'anthropic',
} as const;

export type LlmProviderId =
  (typeof LLM_PROVIDERS)[keyof typeof LLM_PROVIDERS];

interface ResolvedLlmProvider {
  id: LlmProviderId;
  apiKey: string;
  model: string;
}

export interface LlmCompleteOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_MODELS: Record<LlmProviderId, string> = {
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-haiku-4-5-20251001',
};

// ponytail: pick first non-empty key so demo only needs ONE of three keys set
const AUTO_DETECT_ORDER: LlmProviderId[] = ['groq', 'gemini', 'anthropic'];

@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);

  constructor(private readonly configService: ConfigService) {}

  resolveProvider(): ResolvedLlmProvider | null {
    const forced = this.configService
      .get<string>('AI_PROVIDER', '')
      ?.trim()
      .toLowerCase();

    if (
      forced === LLM_PROVIDERS.groq ||
      forced === LLM_PROVIDERS.gemini ||
      forced === LLM_PROVIDERS.anthropic
    ) {
      const apiKey = this.getKeyFor(forced);
      if (!apiKey) {
        return null;
      }
      return {
        id: forced,
        apiKey,
        model: this.getModelFor(forced),
      };
    }

    for (const id of AUTO_DETECT_ORDER) {
      const apiKey = this.getKeyFor(id);
      if (apiKey) {
        return {
          id,
          apiKey,
          model: this.getModelFor(id),
        };
      }
    }

    return null;
  }

  async complete(
    userPrompt: string,
    options: LlmCompleteOptions = {},
  ): Promise<string | null> {
    const provider = this.resolveProvider();
    if (!provider) {
      return null;
    }

    this.logger.log(
      `Using AI provider=${provider.id} model=${provider.model}`,
    );

    switch (provider.id) {
      case LLM_PROVIDERS.groq:
        return this.callGroq(provider, userPrompt, options);
      case LLM_PROVIDERS.gemini:
        return this.callGemini(provider, userPrompt, options);
      case LLM_PROVIDERS.anthropic:
        return this.callAnthropic(provider, userPrompt, options);
      default:
        return null;
    }
  }

  /** @deprecated prefer complete() — kept for advisor call sites */
  async generateExplanation(prompt: string): Promise<string | null> {
    return this.complete(prompt, {
      systemPrompt:
        'Bạn là tư vấn viên trang sức bạc. Chỉ diễn giải số liệu đã cho, không bịa giá mới.',
      temperature: 0.4,
      maxTokens: 400,
    });
  }

  private getKeyFor(id: LlmProviderId): string {
    const envKey =
      id === 'groq'
        ? 'GROQ_API_KEY'
        : id === 'gemini'
          ? 'GEMINI_API_KEY'
          : 'ANTHROPIC_API_KEY';
    return this.configService.get<string>(envKey, '')?.trim() ?? '';
  }

  private getModelFor(id: LlmProviderId): string {
    const envKey =
      id === 'groq'
        ? 'GROQ_MODEL'
        : id === 'gemini'
          ? 'GEMINI_MODEL'
          : 'ANTHROPIC_MODEL';
    return (
      this.configService.get<string>(envKey, '')?.trim() || DEFAULT_MODELS[id]
    );
  }

  private async callGroq(
    provider: ResolvedLlmProvider,
    prompt: string,
    options: LlmCompleteOptions,
  ): Promise<string | null> {
    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: provider.model,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens ?? 500,
          messages,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Groq ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  }

  private async callGemini(
    provider: ResolvedLlmProvider,
    prompt: string,
    options: LlmCompleteOptions,
  ): Promise<string | null> {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${provider.model}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;

    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 500,
      },
    };
    if (options.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Gemini ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  private async callAnthropic(
    provider: ResolvedLlmProvider,
    prompt: string,
    options: LlmCompleteOptions,
  ): Promise<string | null> {
    const body: Record<string, unknown> = {
      model: provider.model,
      max_tokens: options.maxTokens ?? 500,
      messages: [{ role: 'user', content: prompt }],
    };
    if (options.systemPrompt) {
      body.system = options.systemPrompt;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Anthropic ${response.status}: ${await response.text()}`,
      );
    }

    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const textBlock = data.content?.find((block) => block.type === 'text');
    return textBlock?.text?.trim() || null;
  }
}

/** @deprecated use LlmClient — alias for existing imports/tests */
export { LlmClient as LlmExplanationClient };
