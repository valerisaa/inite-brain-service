import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyService } from '../../auth/api-key.service';
import { SurrealService } from '../../db/surreal.service';
import { EmbedderService } from '../embedder.service';

export interface ReindexResult {
  tenantsScanned: number;
  factsScanned: number;
  factsUpdated: number;
  durationMs: number;
  dryRun: boolean;
  provider: string;
}

export interface ReindexOptions {
  /** Limit to a single tenant; default = every known tenant. */
  tenant?: string;
  /** When true, count rows that would be updated but write nothing. */
  dryRun?: boolean;
  /** Cap on facts processed per tenant; protects against runaway batches. */
  maxFacts?: number;
}

interface FactRowForReindex {
  id: { tb: string; id: { String: string } } | string;
  predicate: string;
  object: string;
}

/**
 * Phase 4.D.2 — re-embed existing knowledge_fact rows with the active
 * embedder provider. Used by operators after flipping
 * `EMBEDDER_PROVIDER=bge-m3` so historical facts (still carrying the
 * OpenAI text-embedding-3-small vector) move into the new vector
 * space and become reachable by cross-lingual queries.
 *
 * Safety:
 *   - tenant-aware: one tenant's failure logs and continues
 *   - paginated: SELECT ... LIMIT N OFFSET ... so memory stays flat
 *   - dryRun: counts rows without writing — operators sanity-check
 *     batch size before committing
 *   - idempotent: an already-correct row is rewritten with the same
 *     vector, no semantic change
 *
 * NOT scheduled. Triggered only via the admin endpoint so an operator
 * sees the impact in real time.
 */
@Injectable()
export class ReindexEmbeddingsService {
  private readonly logger = new Logger(ReindexEmbeddingsService.name);
  private readonly batchSize: number;

  constructor(
    private readonly surreal: SurrealService,
    private readonly apiKeys: ApiKeyService,
    private readonly embedder: EmbedderService,
    config: ConfigService,
  ) {
    this.batchSize = parseInt(
      config.get<string>('REINDEX_BATCH_SIZE', '200'),
      10,
    );
  }

  async run(opts: ReindexOptions = {}): Promise<ReindexResult> {
    const started = Date.now();
    const dryRun = opts.dryRun === true;
    const maxFacts = opts.maxFacts ?? Number.MAX_SAFE_INTEGER;
    const tenants = opts.tenant
      ? [opts.tenant]
      : this.apiKeys.knownCompanyIds();

    let factsScanned = 0;
    let factsUpdated = 0;
    for (const companyId of tenants) {
      try {
        const tenantResult = await this.reindexTenant(companyId, {
          dryRun,
          remaining: maxFacts - factsScanned,
        });
        factsScanned += tenantResult.factsScanned;
        factsUpdated += tenantResult.factsUpdated;
        if (factsScanned >= maxFacts) break;
      } catch (e) {
        this.logger.warn(
          `reindex failed for ${companyId}: ${(e as Error).message}`,
        );
      }
    }

    // Provider id surfaces in the response for operator audit. The
    // stub embedder used in tests doesn't implement cacheStats, so
    // we fall back to 'unknown' instead of crashing the endpoint.
    const provider =
      typeof this.embedder.cacheStats === 'function'
        ? this.embedder.cacheStats().provider
        : 'unknown';
    const result: ReindexResult = {
      tenantsScanned: tenants.length,
      factsScanned,
      factsUpdated,
      durationMs: Date.now() - started,
      dryRun,
      provider,
    };
    this.logger.log(
      `reindex done — provider=${result.provider} tenants=${result.tenantsScanned} scanned=${result.factsScanned} updated=${result.factsUpdated} dryRun=${dryRun}`,
    );
    return result;
  }

  private async reindexTenant(
    companyId: string,
    opts: { dryRun: boolean; remaining: number },
  ): Promise<{ factsScanned: number; factsUpdated: number }> {
    return this.surreal.withCompany(companyId, async (db) => {
      let offset = 0;
      let factsScanned = 0;
      let factsUpdated = 0;
      const batch = Math.min(this.batchSize, opts.remaining);
      // Paginate until either the tenant is empty or we hit the cap.
      while (factsScanned < opts.remaining) {
        const [rows] = await db.query<[FactRowForReindex[]]>(
          `SELECT id, predicate, object
              FROM knowledge_fact
              ORDER BY id
              LIMIT $batch START $offset`,
          { batch, offset },
        );
        const page = (rows as FactRowForReindex[]) ?? [];
        if (page.length === 0) break;

        for (const row of page) {
          factsScanned += 1;
          if (opts.dryRun) continue;
          try {
            const text = `${row.predicate}: ${row.object}`;
            const embedding = await this.embedder.embed(text);
            await db.query(
              `UPDATE $id SET embedding = $embedding`,
              { id: row.id, embedding },
            );
            factsUpdated += 1;
          } catch (e) {
            this.logger.warn(
              `reindex row failed (${companyId}): ${(e as Error).message}`,
            );
          }
        }
        offset += page.length;
        if (page.length < batch) break;
      }
      return { factsScanned, factsUpdated };
    });
  }
}
