import { ConfigService } from '@nestjs/config';

import { LlmClient } from '../llm/llm.client';

function buildConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T = string>(key: string, defaultValue?: T): T =>
      (values[key] as T | undefined) ?? (defaultValue as T),
  } as ConfigService;
}

describe('LlmClient.resolveProvider', () => {
  it('auto-detects Groq when only GROQ_API_KEY is set', () => {
    const client = new LlmClient(buildConfig({ GROQ_API_KEY: 'gsk_test' }));
    expect(client.resolveProvider()?.id).toBe('groq');
  });

  it('auto-detects Gemini when only GEMINI_API_KEY is set', () => {
    const client = new LlmClient(buildConfig({ GEMINI_API_KEY: 'gemini_test' }));
    expect(client.resolveProvider()?.id).toBe('gemini');
  });

  it('auto-detects Anthropic when only ANTHROPIC_API_KEY is set', () => {
    const client = new LlmClient(
      buildConfig({ ANTHROPIC_API_KEY: 'sk-ant-test' }),
    );
    expect(client.resolveProvider()?.id).toBe('anthropic');
  });

  it('prefers AI_PROVIDER override when that key exists', () => {
    const client = new LlmClient(
      buildConfig({
        AI_PROVIDER: 'gemini',
        GROQ_API_KEY: 'gsk_test',
        GEMINI_API_KEY: 'gemini_test',
      }),
    );
    expect(client.resolveProvider()?.id).toBe('gemini');
  });

  it('returns null when no keys are set', () => {
    const client = new LlmClient(buildConfig({}));
    expect(client.resolveProvider()).toBeNull();
  });
});
