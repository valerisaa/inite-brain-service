import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Subject } from 'rxjs';
import type { DebugTraceSnapshot } from './debug-trace-core';
import { SurrealService } from '../db/surreal.service';

/**
 * Ring buffer of per-request debug snapshots.
 *
 * Two storage layers — in-memory (newest first, capacity-bounded) plus
 * an optional best-effort write-through to `debug_trace` per-tenant
 * (migration 0024). The persistence path is opt-in via
 * `DEBUG_TRACE_PERSIST` because two side-effects:
 *
 *   1. Some operators run brain in single-pod mode and don't need it.
 *      Writing each snapshot adds one round-trip per debug request.
 *   2. Spans + artifacts can be sizeable on long agent chains. Cap is
 *      enforced after each write — we keep at most `dbCapacity` rows
 *      per tenant DB, dropping oldest first.
 *
 * Reads always check the in-memory buffer first (fast path for the
 * common case of the operator looking at a trace they just produced).
 * `get` then falls through to the DB so a share-link or a snapshot
 * stranded on a different pod still resolves.
 *
 * Tenant scoping: writes go to the request's `companyId` DB; reads in
 * `list(companyId)` and `get(requestId, companyId)` filter the same
 * field. Cross-tenant reads from in-memory are blocked at the buffer
 * filter; DB fallback for `get` only resolves when the row's stored
 * companyId matches the caller.
 */
/**
 * Metadata shape pushed to SSE subscribers. Strips spans + artifacts
 * so the stream is small even when individual snapshots are heavy.
 */
export type TraceListItem = Omit<DebugTraceSnapshot, 'spans' | 'artifacts'>;

@Injectable()
export class TraceBufferService {
  private readonly logger = new Logger(TraceBufferService.name);
  private buffer: DebugTraceSnapshot[] = [];
  private readonly capacity = 100;
  private readonly dbCapacity: number;
  private readonly persistEnabled: boolean;
  /** Fan-out for SSE subscribers — keyed-by-companyId filter applied in the controller. */
  private readonly stream = new Subject<TraceListItem>();

  constructor(
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly surreal?: SurrealService,
  ) {
    this.persistEnabled =
      this.config?.get<string>('DEBUG_TRACE_PERSIST', '0') === '1' &&
      !!this.surreal;
    const cap = parseInt(
      this.config?.get<string>('DEBUG_TRACE_DB_CAPACITY', '1000') ?? '1000',
      10,
    );
    this.dbCapacity = Number.isFinite(cap) && cap > 0 ? cap : 1000;
  }

  add(snapshot: DebugTraceSnapshot): void {
    this.buffer.unshift(snapshot);
    if (this.buffer.length > this.capacity) {
      this.buffer.length = this.capacity;
    }
    const { spans: _s, artifacts: _a, ...meta } = snapshot;
    this.stream.next(meta);
    if (this.persistEnabled && snapshot.companyId) {
      void this.persist(snapshot).catch((e) => {
        this.logger.warn(
          `debug_trace persist failed (${snapshot.requestId}): ${(e as Error).message}`,
        );
      });
    }
  }

  /**
   * Observable of trace metadata. Tenant scoping happens in the
   * controller `filter` operator — keeping the raw stream untouched
   * lets process-wide consumers (metrics, future tap-ins) subscribe
   * to the same firehose.
   */
  observe() {
    return this.stream.asObservable();
  }

  /**
   * Operator-facing list — companyId optional so a caller with `brain:admin`
   * on a tenant key only sees their own debug traces.
   *
   * In-memory only. Persistence is for `get` (share-link resolution) +
   * survival across pod restart; the listing endpoint is high-traffic
   * (auto-refresh) and a per-call DB hit would tax the tenant DB.
   * Operators looking at older traces use the explicit `get`.
   */
  list(
    companyId?: string,
  ): Array<Omit<DebugTraceSnapshot, 'spans' | 'artifacts'>> {
    const rows = companyId
      ? this.buffer.filter((s) => s.companyId === companyId)
      : this.buffer;
    return rows.map(({ spans: _s, artifacts: _a, ...rest }) => rest);
  }

  async get(
    requestId: string,
    companyId?: string,
  ): Promise<DebugTraceSnapshot | undefined> {
    const hit = this.buffer.find((s) => s.requestId === requestId);
    if (hit) {
      if (companyId && hit.companyId && hit.companyId !== companyId) {
        return undefined;
      }
      return hit;
    }
    if (!this.persistEnabled || !this.surreal || !companyId) return undefined;
    try {
      return await this.surreal.withCompany(companyId, async (db) => {
        const res = (await db.query<any[]>(
          `SELECT requestId, ts, method, path, status, durationMs, companyId,
                  spans, artifacts, errored
             FROM debug_trace
            WHERE requestId = $r AND companyId = $c LIMIT 1`,
          { r: requestId, c: companyId },
        )) as any[];
        const rows = (res[0] ?? []) as any[];
        const row = rows[0];
        if (!row) return undefined;
        return {
          requestId: row.requestId,
          ts: typeof row.ts === 'string' ? row.ts : new Date(row.ts).toISOString(),
          method: row.method,
          path: row.path,
          status: row.status,
          durationMs: row.durationMs,
          companyId: row.companyId,
          spans: Array.isArray(row.spans) ? row.spans : [],
          artifacts: Array.isArray(row.artifacts) ? row.artifacts : [],
          errored: row.errored ?? undefined,
        } as DebugTraceSnapshot;
      });
    } catch (e) {
      this.logger.warn(
        `debug_trace get fallback failed (${requestId}): ${(e as Error).message}`,
      );
      return undefined;
    }
  }

  private async persist(snapshot: DebugTraceSnapshot): Promise<void> {
    if (!this.surreal || !snapshot.companyId) return;
    await this.surreal.withCompany(snapshot.companyId, async (db) => {
      await db.query(
        `CREATE debug_trace CONTENT {
           requestId: $requestId,
           ts: $ts,
           method: $method,
           path: $path,
           status: $status,
           durationMs: $durationMs,
           companyId: $companyId,
           spans: $spans,
           artifacts: $artifacts,
           errored: $errored
         }`,
        {
          requestId: snapshot.requestId,
          ts: snapshot.ts,
          method: snapshot.method,
          path: snapshot.path,
          status: snapshot.status,
          durationMs: snapshot.durationMs,
          companyId: snapshot.companyId,
          spans: snapshot.spans,
          artifacts: snapshot.artifacts,
          errored: snapshot.errored ?? null,
        },
      );
      await db.query(
        `LET $cap = ${this.dbCapacity};
         LET $extra = (SELECT count() AS c FROM debug_trace GROUP ALL)[0].c - $cap;
         IF $extra > 0 {
           LET $stale = (SELECT id FROM debug_trace ORDER BY ts ASC LIMIT $extra);
           DELETE $stale.*;
         };`,
      );
    });
  }
}
