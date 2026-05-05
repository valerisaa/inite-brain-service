import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
  type LabelValues,
} from 'prom-client';

/**
 * MetricsService — owns the Prometheus registry for the brain.
 *
 * One registry per process, exposed via /metrics. Default node metrics
 * (process_*, nodejs_*) are enabled so ops gets RSS/heap/event-loop lag
 * for free. Domain metrics are minimal and bounded by label cardinality:
 *
 *   - ingest_facts_total{outcome}             — INSERTED|SUPERSEDED|COMPETING|REJECTED
 *   - ingest_mentions_total{result}           — extracted|skipped|failed
 *   - search_duration_seconds                 — histogram, buckets tuned for ~ms-to-1s
 *   - retract_total / forget_total            — counters
 *   - compaction_facts_total                  — counter, summed across tenants
 *   - openai_tokens_total{kind, type}         — embed|chat × prompt|completion
 *   - openai_calls_total{kind, outcome}       — embed|chat × ok|error
 *   - openai_call_duration_seconds{kind}      — histogram per kind
 *
 * No `companyId` label — that would be unbounded cardinality. Per-tenant
 * dashboards are built off log lines (which carry companyId) instead.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly ingestFacts = new Counter({
    name: 'brain_ingest_facts_total',
    help: 'Number of fact ingests by outcome',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });

  readonly ingestMentions = new Counter({
    name: 'brain_ingest_mentions_total',
    help: 'Number of mention ingests by result',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly searchDuration = new Histogram({
    name: 'brain_search_duration_seconds',
    help: 'Search latency in seconds',
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  readonly retracts = new Counter({
    name: 'brain_retract_total',
    help: 'Number of fact retractions',
    registers: [this.registry],
  });

  readonly forgets = new Counter({
    name: 'brain_forget_total',
    help: 'Number of entity forgets (cascade)',
    registers: [this.registry],
  });

  readonly compactionFacts = new Counter({
    name: 'brain_compaction_facts_total',
    help: 'Number of facts compacted (sum across tenants)',
    registers: [this.registry],
  });

  readonly openaiTokens = new Counter({
    name: 'brain_openai_tokens_total',
    help: 'OpenAI tokens consumed, by call kind and token type',
    labelNames: ['kind', 'type'] as const,
    registers: [this.registry],
  });

  readonly openaiCalls = new Counter({
    name: 'brain_openai_calls_total',
    help: 'OpenAI API calls by kind and outcome',
    labelNames: ['kind', 'outcome'] as const,
    registers: [this.registry],
  });

  readonly openaiCallDuration = new Histogram({
    name: 'brain_openai_call_duration_seconds',
    help: 'OpenAI API call latency in seconds, by kind',
    labelNames: ['kind'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    registers: [this.registry],
  });

  onModuleInit() {
    // Node defaults: GC, event-loop lag, memory, CPU. Cheap and useful.
    collectDefaultMetrics({ register: this.registry, prefix: 'brain_' });
  }

  countIngestFact(outcome: string): void {
    this.ingestFacts.inc({ outcome } as LabelValues<'outcome'>);
  }

  countIngestMention(result: string): void {
    this.ingestMentions.inc({ result } as LabelValues<'result'>);
  }

  observeSearchDuration(seconds: number): void {
    this.searchDuration.observe(seconds);
  }

  countRetract(): void {
    this.retracts.inc();
  }

  countForget(): void {
    this.forgets.inc();
  }

  countCompacted(n: number): void {
    if (n > 0) this.compactionFacts.inc(n);
  }

  /**
   * Record an OpenAI call. Pass token counts as reported by the SDK
   * (`response.usage.prompt_tokens` / `completion_tokens`). For embeddings
   * the API returns `prompt_tokens` only; pass 0 for completion.
   */
  recordOpenAiCall(args: {
    kind: 'embed' | 'chat';
    outcome: 'ok' | 'error';
    durationSeconds: number;
    promptTokens?: number;
    completionTokens?: number;
  }): void {
    this.openaiCalls.inc({ kind: args.kind, outcome: args.outcome } as LabelValues<
      'kind' | 'outcome'
    >);
    this.openaiCallDuration.observe(
      { kind: args.kind } as LabelValues<'kind'>,
      args.durationSeconds,
    );
    if (args.promptTokens && args.promptTokens > 0) {
      this.openaiTokens.inc(
        { kind: args.kind, type: 'prompt' } as LabelValues<'kind' | 'type'>,
        args.promptTokens,
      );
    }
    if (args.completionTokens && args.completionTokens > 0) {
      this.openaiTokens.inc(
        { kind: args.kind, type: 'completion' } as LabelValues<'kind' | 'type'>,
        args.completionTokens,
      );
    }
  }

  async serialize(): Promise<{ contentType: string; body: string }> {
    return {
      contentType: this.registry.contentType,
      body: await this.registry.metrics(),
    };
  }
}
