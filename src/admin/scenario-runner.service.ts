import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IngestService } from '../ingest/ingest.service';
import { FactsService } from '../facts/facts.service';
import { EntitiesService } from '../entities/entities.service';
import { SearchService, SearchHit } from '../search/search.service';
import { SurrealService } from '../db/surreal.service';
import { allScenarios } from '../../test/eval/scenarios';
import type {
  Scenario,
  SetupStep,
  SetupFactStep,
  SetupMentionStep,
  SetupLinkStep,
  SetupRetractStep,
  SetupForgetStep,
  QueryExpectation,
} from '../../test/eval/types';

export interface ScenarioListItem {
  id: string;
  vertical: string;
  description: string;
  setupSteps: number;
  queries: number;
  hasMemoryAssertions: boolean;
  hasIdentityMerge: boolean;
  hasSynthesize: boolean;
}

export interface ScenarioQueryResult {
  query: string;
  expectedTopEntityRef: string;
  rankOfExpected: number;
  topEntityRef: string | null;
  factPredicateMatched: boolean | null;
  asOf?: string;
  durationMs: number;
  hitCount: number;
  topHits: Array<{
    entityId: string;
    canonicalName: string;
    score: number;
    externalRefs: Record<string, string>;
  }>;
  passed: boolean;
}

export interface ScenarioRunOutcome {
  scenarioId: string;
  vertical: string;
  companyId: string;
  startedAt: string;
  durationMs: number;
  passed: boolean;
  setupSummary: {
    facts: number;
    mentions: number;
    links: number;
    retracts: number;
    forgets: number;
    errors: Array<{ step: number; kind: string; error: string }>;
  };
  queryResults: ScenarioQueryResult[];
  metrics: {
    recallAt1: number;
    recallAt5: number;
    queries: number;
    passes: number;
  };
}

export interface ScenarioRunOptions {
  isolateTenant?: boolean;
  keepTenant?: boolean;
  /** Caller's companyId — used as the tenant when isolateTenant=false. */
  defaultCompanyId: string;
}

const FALLBACK_SOURCE = (vertical: string) => ({ vertical });

@Injectable()
export class ScenarioRunnerService {
  private readonly logger = new Logger(ScenarioRunnerService.name);

  constructor(
    private readonly ingest: IngestService,
    private readonly facts: FactsService,
    private readonly entities: EntitiesService,
    private readonly search: SearchService,
    private readonly surreal: SurrealService,
  ) {}

  list(): ScenarioListItem[] {
    return allScenarios.map((s) => ({
      id: s.id,
      vertical: s.vertical,
      description: s.description,
      setupSteps: s.setup.length,
      queries: s.queries.length,
      hasMemoryAssertions: !!s.memoryAssertions?.length,
      hasIdentityMerge: !!s.identityMerge,
      hasSynthesize: !!s.synthesizeQueries?.length,
    }));
  }

  getById(id: string): Scenario {
    const s = allScenarios.find((x) => x.id === id);
    if (!s) throw new NotFoundException(`Scenario ${id} not found`);
    return s;
  }

  async runOne(id: string, opts: ScenarioRunOptions): Promise<ScenarioRunOutcome> {
    const scenario = this.getById(id);
    const startedAt = Date.now();
    const isolate = opts.isolateTenant !== false;
    const companyId = isolate
      ? `eval_${slugify(id)}_${Date.now().toString(36)}`
      : opts.defaultCompanyId;

    const setupSummary: ScenarioRunOutcome['setupSummary'] = {
      facts: 0,
      mentions: 0,
      links: 0,
      retracts: 0,
      forgets: 0,
      errors: [],
    };
    const factIdsByTag = new Map<string, string>();

    for (let i = 0; i < scenario.setup.length; i++) {
      const step = scenario.setup[i];
      try {
        await this.applyStep(companyId, step, setupSummary, factIdsByTag);
      } catch (e) {
        setupSummary.errors.push({
          step: i,
          kind: step.kind,
          error: (e as Error).message,
        });
      }
    }

    const queryResults: ScenarioQueryResult[] = [];
    for (const q of scenario.queries) {
      queryResults.push(await this.runQuery(companyId, q));
    }

    const passes = queryResults.filter((q) => q.passed).length;
    const passedAll =
      setupSummary.errors.length === 0 && passes === queryResults.length;

    const outcome: ScenarioRunOutcome = {
      scenarioId: scenario.id,
      vertical: scenario.vertical,
      companyId,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      passed: passedAll,
      setupSummary,
      queryResults,
      metrics: {
        recallAt1: queryResults.length
          ? queryResults.filter((q) => q.rankOfExpected === 1).length /
            queryResults.length
          : 0,
        recallAt5: queryResults.length
          ? queryResults.filter(
              (q) => q.rankOfExpected > 0 && q.rankOfExpected <= 5,
            ).length / queryResults.length
          : 0,
        queries: queryResults.length,
        passes,
      },
    };

    if (isolate && !opts.keepTenant) {
      try {
        await this.surreal.dropCompanyDatabase(companyId);
      } catch (e) {
        this.logger.warn(
          `Could not drop ephemeral tenant ${companyId}: ${(e as Error).message}`,
        );
      }
    }
    return outcome;
  }

  async cleanupEphemeralTenants(): Promise<string[]> {
    // Best-effort: list known evals databases via the surreal admin pool.
    // No central registry exists, so we leave deletion to dropCompanyDatabase
    // calls for explicitly-known ids. This method is a stub for the v2
    // cleanup UI; for now it just reports an empty list.
    return [];
  }

  private async applyStep(
    companyId: string,
    step: SetupStep,
    summary: ScenarioRunOutcome['setupSummary'],
    factIdsByTag: Map<string, string>,
  ): Promise<void> {
    switch (step.kind) {
      case 'fact': {
        await this.applyFact(companyId, step, factIdsByTag);
        summary.facts += 1;
        break;
      }
      case 'mention': {
        await this.applyMention(companyId, step);
        summary.mentions += 1;
        break;
      }
      case 'link': {
        await this.ingest.ingestLink(companyId, {
          from: step.from,
          to: step.to,
          kind: step.linkKind,
          source: step.source,
        });
        summary.links += 1;
        break;
      }
      case 'retract': {
        await this.applyRetract(companyId, step, factIdsByTag);
        summary.retracts += 1;
        break;
      }
      case 'forget': {
        await this.applyForget(companyId, step);
        summary.forgets += 1;
        break;
      }
    }
  }

  private async applyFact(
    companyId: string,
    step: SetupFactStep,
    factIdsByTag: Map<string, string>,
  ): Promise<void> {
    const res = await this.ingest.ingestFact(companyId, {
      entityRef: step.entityRef,
      predicate: step.predicate,
      object: step.object,
      validFrom: step.validFrom,
      validUntil: step.validUntil,
      confidence: step.confidence,
      source: step.source,
    });
    if (step.tag && res.factId) factIdsByTag.set(step.tag, res.factId);
  }

  private async applyMention(
    companyId: string,
    step: SetupMentionStep,
  ): Promise<void> {
    await this.ingest.ingestMention(companyId, {
      text: step.text,
      contextRef: step.contextRef,
      knownEntities: step.knownEntities,
      emittedAt: step.emittedAt,
    });
  }

  private async applyRetract(
    companyId: string,
    step: SetupRetractStep,
    factIdsByTag: Map<string, string>,
  ): Promise<void> {
    const factId = factIdsByTag.get(step.tag);
    if (!factId) {
      throw new Error(`Retract references unknown tag '${step.tag}'`);
    }
    await this.facts.retract(companyId, factId, {
      reason: step.reason,
      retractedBy: { source: 'system' },
    });
  }

  private async applyForget(
    companyId: string,
    step: SetupForgetStep,
  ): Promise<void> {
    // Resolve entityId via search-by-externalRef (lightweight — we
    // could read entity_external_ref directly, but the helper search
    // path is sufficient for the eval scale).
    const refKey = `${safe(step.entityRef.vertical)}__${safe(step.entityRef.id)}`;
    const hit = await this.findEntityByExternalRef(companyId, refKey);
    if (!hit) {
      throw new Error(`Forget could not resolve ${refKey}`);
    }
    await this.entities.forget(companyId, hit, {
      reason: step.reason,
      requestId: step.requestId,
    });
  }

  private async findEntityByExternalRef(
    companyId: string,
    refKey: string,
  ): Promise<string | null> {
    return this.surreal.withCompany(companyId, async (db) => {
      const [rows] = await db.query<[any[]]>(
        `SELECT VALUE entity FROM entity_external_ref WHERE key = $key LIMIT 1`,
        { key: refKey },
      );
      const arr = (rows as any[]) ?? [];
      return arr[0] ? String(arr[0]) : null;
    });
  }

  private async runQuery(
    companyId: string,
    expectation: QueryExpectation,
  ): Promise<ScenarioQueryResult> {
    const t0 = Date.now();
    const callerScopes = expectation.callerScopes ?? [
      'brain:read',
      'brain:read_pii',
    ];

    let hits: SearchHit[] = [];
    let error: string | undefined;
    try {
      const res = await this.search.search(
        companyId,
        {
          query: expectation.query,
          limit: 10,
          asOf: expectation.asOf,
          ...(expectation.predicates ? { predicates: expectation.predicates } : {}),
        } as any,
        callerScopes as any,
      );
      hits = res.results;
    } catch (e) {
      error = (e as Error).message;
    }

    const [vertical, id] = expectation.expectedTopEntityRef.split('.', 2);
    const refTag = `${safe(vertical)}__${safe(id)}`;
    const rank = hits.findIndex((r) => r.externalRefs?.[refTag] === id);
    const rankOfExpected = rank === -1 ? 0 : rank + 1;
    const top = hits[0] ?? null;
    const topEntityRef = top
      ? formatTopRef(top.externalRefs)
      : null;

    const factPredicateMatched =
      expectation.expectedFactPredicate && rankOfExpected > 0
        ? hits[rankOfExpected - 1].facts.some(
            (f) => f.predicate === expectation.expectedFactPredicate,
          )
        : null;

    const passed =
      !error &&
      rankOfExpected === 1 &&
      (factPredicateMatched === null ? true : factPredicateMatched);

    return {
      query: expectation.query,
      expectedTopEntityRef: expectation.expectedTopEntityRef,
      rankOfExpected,
      topEntityRef,
      factPredicateMatched,
      asOf: expectation.asOf,
      durationMs: Date.now() - t0,
      hitCount: hits.length,
      topHits: hits.slice(0, 3).map((h) => ({
        entityId: h.entityId,
        canonicalName: h.canonicalName,
        score: h.score,
        externalRefs: h.externalRefs ?? {},
      })),
      passed,
    };
  }
}

function formatTopRef(refs: Record<string, string> | undefined): string | null {
  if (!refs) return null;
  const entries = Object.entries(refs);
  if (entries.length === 0) return null;
  const [k, v] = entries[0];
  const dot = k.indexOf('__');
  if (dot === -1) return `${k}.${v}`;
  return `${k.slice(0, dot)}.${v}`;
}

function safe(s: string): string {
  return s.replace(/\./g, '__');
}

function slugify(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]+/g, '_').slice(0, 40);
}
