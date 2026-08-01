import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LlmClient } from './llm.client';

export interface TranslateResult {
  sourceLocale: string;
  targetLocale: string;
  translatedText: string;
}

export interface MessageI18nMeta {
  sourceLocale: string;
  targetLocale: string;
  /** Present on CUSTOMER messages — sale-language rendering of content */
  translatedText?: string;
  /** Present on SALE messages — what the sale originally typed */
  originalText?: string;
}

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    private readonly llmClient: LlmClient,
    private readonly configService: ConfigService,
  ) {}

  getSaleLocale(): string {
    return (
      this.configService.get<string>('SALE_LOCALE', 'vi')?.trim().toLowerCase() ||
      'vi'
    );
  }

  getDefaultCustomerLocale(): string {
    return (
      this.configService
        .get<string>('DEFAULT_CUSTOMER_LOCALE', 'en')
        ?.trim()
        .toLowerCase() || 'en'
    );
  }

  async detectAndTranslateToSale(
    text: string,
    knownCustomerLocale?: string | null,
  ): Promise<TranslateResult | null> {
    const saleLocale = this.getSaleLocale();
    return this.translate({
      text,
      targetLocale: saleLocale,
      sourceLocaleHint: knownCustomerLocale,
      detectSource: !knownCustomerLocale,
    });
  }

  async translateToCustomer(
    text: string,
    customerLocale: string,
  ): Promise<TranslateResult | null> {
    const saleLocale = this.getSaleLocale();
    if (normalizeLocale(customerLocale) === normalizeLocale(saleLocale)) {
      return null;
    }
    return this.translate({
      text,
      targetLocale: customerLocale,
      sourceLocaleHint: saleLocale,
      detectSource: false,
    });
  }

  private async translate(input: {
    text: string;
    targetLocale: string;
    sourceLocaleHint?: string | null;
    detectSource: boolean;
  }): Promise<TranslateResult | null> {
    if (!this.llmClient.resolveProvider()) {
      return null;
    }

    const target = normalizeLocale(input.targetLocale);
    const hint = input.sourceLocaleHint
      ? normalizeLocale(input.sourceLocaleHint)
      : null;

    if (!input.detectSource && hint && hint === target) {
      return null;
    }

    const prompt = [
      'You are a translation engine for a jewelry shop chat.',
      'Return ONLY valid JSON, no markdown:',
      '{"sourceLocale":"bcp47","translatedText":"..."}',
      `Target locale: ${target}`,
      input.detectSource
        ? 'Detect the source language of the text.'
        : `Source locale hint: ${hint ?? 'auto'}`,
      'Keep meaning, tone, and numbers. Do not add explanations.',
      `Text:\n${input.text}`,
    ].join('\n');

    try {
      const raw = await this.llmClient.complete(prompt, {
        systemPrompt:
          'You translate chat messages. Output JSON only with keys sourceLocale and translatedText.',
        temperature: 0.1,
        maxTokens: 500,
      });
      if (!raw) {
        return null;
      }

      const parsed = parseTranslationJson(raw);
      if (!parsed?.translatedText) {
        return null;
      }

      const sourceLocale = normalizeLocale(
        parsed.sourceLocale || hint || target,
      );
      if (sourceLocale === target && parsed.translatedText.trim() === input.text.trim()) {
        return null;
      }

      return {
        sourceLocale,
        targetLocale: target,
        translatedText: parsed.translatedText.trim(),
      };
    } catch (error) {
      this.logger.warn(`Translation failed: ${String(error)}`);
      return null;
    }
  }
}

function normalizeLocale(locale: string): string {
  return locale.trim().toLowerCase().split(/[-_]/)[0] || 'und';
}

function parseTranslationJson(
  raw: string,
): { sourceLocale?: string; translatedText?: string } | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/\{[\s\S]*\}/);
  const jsonText = fenced?.[0] ?? trimmed;
  try {
    return JSON.parse(jsonText) as {
      sourceLocale?: string;
      translatedText?: string;
    };
  } catch {
    return null;
  }
}
