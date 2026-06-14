import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LRUCache } from '../common/lru-cache';

/**
 * Zero-shot intent classifier — multilingual NLI without enumerated
 * lexicons.
 *
 * Architecture:
 *   • Lazy-load a multilingual NLI model on module init (background;
 *     never blocks boot, never blocks the first request).
 *   • Until the model is ready, `classify` falls back to the
 *     punctuation-only heuristic (`?` → ask, else → tell).
 *   • Once ready, every miss runs through the NLI pipeline against the
 *     candidate labels ["question", "statement"]. The model assigns a
 *     probability to each; the higher wins and its probability becomes
 *     the confidence.
 *   • Results are LRU-cached on the trimmed message text — repeat
 *     queries are free.
 *
 * Model choice: `Xenova/distilbert-base-multilingual-cased-finetuned-mnli`
 * (~135MB ONNX). XNLI-finetuned distilbert, 100+ languages including
 * English + Russian. Trade-off vs `Xenova/mDeBERTa-v3-base-mnli-xnli`
 * (~330MB, better quality): the distilled model gives sub-200ms
 * inference on Node CPU, which keeps the LLM-skip path latency budget
 * intact. Override with CHAT_ROUTE_NLI_MODEL when better accuracy is
 * worth the latency.
 *
 * No hardcoded phrase lists, no wh-pronoun catalogues, no
 * "interrogative cues" tables — every signal is derived from the
 * model's pretrained understanding of natural language.
 */

type ZeroShotPipeline = (
  text: string,
  labels: string[],
  options: { hypothesis_template: string },
) => Promise<{
  sequence: string;
  labels: string[];
  scores: number[];
}>;

export interface IntentResult {
  intent: 'ask' | 'tell';
  confidence: number;
  source: 'nli' | 'punctuation' | 'cache';
}

const CACHE_SIZE = 2000;
const DEFAULT_MODEL =
  'Xenova/distilbert-base-multilingual-cased-finetuned-mnli';

@Injectable()
export class IntentClassifierService implements OnModuleInit {
  private readonly logger = new Logger(IntentClassifierService.name);
  private readonly modelId: string;
  private readonly enabled: boolean;
  private readonly askThreshold: number;
  private classifier: ZeroShotPipeline | null = null;
  private readonly cache = new LRUCache<
    string,
    { intent: 'ask' | 'tell'; confidence: number }
  >(CACHE_SIZE);

  constructor(private readonly config: ConfigService) {
    this.enabled =
      this.config.get<string>('CHAT_ROUTE_NLI_ENABLED', 'true') !== 'false';
    this.modelId = this.config.get<string>(
      'CHAT_ROUTE_NLI_MODEL',
      DEFAULT_MODEL,
    );
    this.askThreshold = parseFloat(
      this.config.get<string>('CHAT_ROUTE_NLI_ASK_THRESHOLD', '0.6'),
    );
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log(
        'NLI intent classifier disabled (CHAT_ROUTE_NLI_ENABLED=false) — punctuation-only intent',
      );
      return;
    }
    // Fire-and-forget warmup. The route handler never awaits this —
    // classify() falls back to punctuation while the model loads.
    void this.warmup();
  }

  isReady(): boolean {
    return this.classifier !== null;
  }

  stats(): {
    enabled: boolean;
    ready: boolean;
    model: string;
    askThreshold: number;
    cacheSize: number;
  } {
    return {
      enabled: this.enabled,
      ready: this.classifier !== null,
      model: this.modelId,
      askThreshold: this.askThreshold,
      cacheSize: this.cache.size,
    };
  }

  /** Test-only seam — injects a mock pipeline so unit tests can drive
   *  the NLI code path without loading the real model. */
  setClassifierForTesting(pipeline: ZeroShotPipeline | null): void {
    this.classifier = pipeline;
    this.cache.clear();
  }

  private async warmup(): Promise<void> {
    const start = Date.now();
    try {
      const transformers = await import('@xenova/transformers');
      // Dynamic import so the transformers runtime is only paid for
      // when the feature is enabled — keeps cold-boot fast in
      // CHAT_ROUTE_NLI_ENABLED=false deployments.
      this.classifier = (await transformers.pipeline(
        'zero-shot-classification',
        this.modelId,
      )) as unknown as ZeroShotPipeline;
      this.logger.log(
        `NLI classifier ready (${this.modelId}) — warmup ${Date.now() - start}ms`,
      );
    } catch (e) {
      this.logger.warn(
        `NLI classifier warmup failed for ${this.modelId}: ${(e as Error).message}; falling back to punctuation-only`,
      );
      this.classifier = null;
    }
  }

  async classify(message: string): Promise<IntentResult> {
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return { intent: 'tell', confidence: 0, source: 'punctuation' };
    }
    // Fast path: trailing `?` is universal and unambiguous — skip the
    // model entirely and save ~100-200ms inference latency.
    if (/\?\s*$/.test(message)) {
      return { intent: 'ask', confidence: 0.95, source: 'punctuation' };
    }
    if (!this.classifier) {
      return { intent: 'tell', confidence: 0.7, source: 'punctuation' };
    }
    const cached = this.cache.get(trimmed);
    if (cached) {
      return { ...cached, source: 'cache' };
    }
    try {
      const result = await this.classifier(
        trimmed,
        ['question', 'statement'],
        { hypothesis_template: 'This text is a {}.' },
      );
      const qIdx = result.labels.indexOf('question');
      const qScore = qIdx >= 0 ? result.scores[qIdx] : 0;
      let intent: 'ask' | 'tell';
      let confidence: number;
      if (qScore >= this.askThreshold) {
        intent = 'ask';
        confidence = qScore;
      } else {
        intent = 'tell';
        confidence = 1 - qScore;
      }
      const value = { intent, confidence };
      this.cache.set(trimmed, value);
      return { ...value, source: 'nli' };
    } catch (e) {
      this.logger.warn(
        `NLI classify failed for "${trimmed.slice(0, 80)}": ${(e as Error).message}; falling back to punctuation`,
      );
      return { intent: 'tell', confidence: 0.7, source: 'punctuation' };
    }
  }
}
