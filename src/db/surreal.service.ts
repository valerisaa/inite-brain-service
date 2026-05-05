import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Surreal } from 'surrealdb';
import { join } from 'node:path';
import { SchemaMigrator } from './migrator.service';

/**
 * SurrealService — pooled connections with per-tenant database routing.
 *
 * Why a pool: Surreal's `db.use({ namespace, database })` mutates connection
 * state. A single shared connection across concurrent requests would race —
 * a request for tenant A could see queries land on tenant B's database
 * because B's `use()` ran between A's `use()` and A's query.
 *
 * Each request acquires an idle connection, switches it to its tenant's
 * database, runs its query, and releases. Connections are never shared
 * mid-flight, so the `use()` state is stable for the duration of `fn`.
 *
 * Tenancy: NS=brain, DB=co_<companyId>. Cross-tenant queries are
 * physically impossible from outside `withCompany`.
 */
@Injectable()
export class SurrealService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SurrealService.name);
  private readonly all: Surreal[] = [];
  private readonly idle: Surreal[] = [];
  private readonly waiters: Array<(c: Surreal) => void> = [];
  private namespace!: string;
  private poolSize!: number;
  private readonly knownDatabases = new Set<string>();
  // All schema applications (across all databases) are serialized through
  // this chain. SurrealDB raises transaction read-conflicts when multiple
  // tenants concurrently CREATE DATABASE + DEFINE on shared metadata.
  private schemaQueue: Promise<unknown> = Promise.resolve();
  private readonly migrator: SchemaMigrator;

  constructor(private readonly configService: ConfigService) {
    this.migrator = new SchemaMigrator(join(__dirname, 'migrations'));
  }

  async onModuleInit() {
    const url = this.configService.getOrThrow<string>('SURREALDB_URL');
    const username = this.configService.getOrThrow<string>('SURREALDB_USERNAME');
    const password = this.configService.getOrThrow<string>('SURREALDB_PASSWORD');
    this.namespace = this.configService.get<string>('SURREALDB_NAMESPACE', 'brain');
    this.poolSize = parseInt(
      this.configService.get<string>('SURREALDB_POOL_SIZE', '8'),
      10,
    );
    if (!Number.isFinite(this.poolSize) || this.poolSize < 1) {
      throw new Error('SURREALDB_POOL_SIZE must be a positive integer');
    }

    for (let i = 0; i < this.poolSize; i++) {
      const conn = new Surreal();
      await conn.connect(url);
      await conn.signin({ username, password });
      this.all.push(conn);
      this.idle.push(conn);
    }
    this.logger.log(
      `Connected to SurrealDB at ${url}, pool=${this.poolSize}, namespace=${this.namespace}`,
    );
  }

  async onModuleDestroy() {
    await Promise.all(
      this.all.map((c) =>
        c.close().catch((e: unknown) => {
          this.logger.warn(`Error closing Surreal connection: ${(e as Error).message}`);
        }),
      ),
    );
  }

  async ping(): Promise<boolean> {
    if (this.all.length === 0) return false;
    try {
      await this.all[0].version();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run a callback inside a per-tenant database scope on a pool-acquired
   * connection. Schema is applied lazily on first use of a database.
   * The connection is exclusive to this callback for its lifetime.
   */
  async withCompany<T>(companyId: string, fn: (db: Surreal) => Promise<T>): Promise<T> {
    if (!/^[a-zA-Z0-9_-]+$/.test(companyId)) {
      throw new Error(`Invalid companyId: ${companyId}`);
    }
    const database = `co_${companyId}`;
    const conn = await this.acquire();
    try {
      await conn.use({ namespace: this.namespace, database });
      await this.ensureSchema(conn, database);
      return await fn(conn);
    } finally {
      this.release(conn);
    }
  }

  /**
   * Hard-delete a tenant's entire database. Used by tenant offboarding
   * and per-entity cascade-forget.
   */
  async dropCompanyDatabase(companyId: string): Promise<void> {
    if (!/^[a-zA-Z0-9_-]+$/.test(companyId)) {
      throw new Error(`Invalid companyId: ${companyId}`);
    }
    const database = `co_${companyId}`;
    const conn = await this.acquire();
    try {
      await conn.use({ namespace: this.namespace, database });
      await conn.query(`REMOVE DATABASE ${database};`);
      this.knownDatabases.delete(database);
      this.logger.warn(`Dropped database ${this.namespace}/${database}`);
    } finally {
      this.release(conn);
    }
  }

  /** Test-only: stats for monitoring tests / debugging. */
  poolStats(): { size: number; idle: number; waiters: number } {
    return { size: this.poolSize, idle: this.idle.length, waiters: this.waiters.length };
  }

  private acquire(): Promise<Surreal> {
    const free = this.idle.shift();
    if (free) return Promise.resolve(free);
    return new Promise<Surreal>((resolve) => this.waiters.push(resolve));
  }

  private release(conn: Surreal): void {
    const next = this.waiters.shift();
    if (next) {
      next(conn);
    } else {
      this.idle.push(conn);
    }
  }

  private async ensureSchema(conn: Surreal, database: string): Promise<void> {
    if (this.knownDatabases.has(database)) return;
    const next = this.schemaQueue.then(async () => {
      // Recheck under the queue: another request may have applied schema
      // for this database while we were waiting.
      if (this.knownDatabases.has(database)) return;
      const result = await this.migrator.migrate(conn);
      this.knownDatabases.add(database);
      if (result.applied.length > 0) {
        this.logger.log(
          `Migrated ${this.namespace}/${database}: applied [${result.applied.join(', ')}], ` +
            `already-applied [${result.alreadyApplied.join(', ') || '-'}]`,
        );
      } else {
        this.logger.log(
          `Schema up-to-date for ${this.namespace}/${database} ` +
            `(${result.alreadyApplied.length} migration(s) applied)`,
        );
      }
    });
    this.schemaQueue = next.catch(() => undefined);
    await next;
  }
}

/**
 * SDK-version-stable helpers for SurrealDB record CRUD. The 2.x JS SDK
 * replaced the simple `db.create('table', payload)` / `db.merge(id, patch)`
 * shape with a chained-promise builder; tying every call site to that
 * shape would couple business code to driver internals. These helpers
 * wrap the underlying primitives via `db.query()` so we keep one
 * uniform query form everywhere.
 */
export async function dbCreate<T extends Record<string, unknown>>(
  db: Surreal,
  table: string,
  data: Record<string, unknown>,
): Promise<T> {
  const [rows] = await db.query<[T[]]>(`CREATE type::table($t) CONTENT $d RETURN AFTER`, {
    t: table,
    d: data,
  });
  const arr = (rows as T[]) ?? [];
  return arr[0];
}

export async function dbMerge<T extends Record<string, unknown>>(
  db: Surreal,
  recordId: string,
  patch: Record<string, unknown>,
): Promise<T> {
  const [rows] = await db.query<[T[]]>(
    `UPDATE type::thing($t, $i) MERGE $p RETURN AFTER`,
    { t: tableOf(recordId), i: idOf(recordId), p: patch },
  );
  const arr = (rows as T[]) ?? [];
  return arr[0];
}

function tableOf(rid: string): string {
  const idx = rid.indexOf(':');
  return idx === -1 ? rid : rid.slice(0, idx);
}
function idOf(rid: string): string {
  const idx = rid.indexOf(':');
  return idx === -1 ? rid : rid.slice(idx + 1);
}

/**
 * Run a SurrealDB transaction. The WebSocket protocol's `query()` method
 * scopes each call as its own evaluation context, so BEGIN/COMMIT issued
 * via separate `query()` calls fail with `Unexpected statement type
 * encountered: Commit(CommitStatement)` — the COMMIT statement has no
 * matching BEGIN in scope. The fix is to send the entire transaction as
 * one multi-statement SurrealQL block in a single `query()` call.
 *
 * `runTransaction` lets the caller assemble statements via a builder and
 * sends them all together inside `BEGIN TRANSACTION; ...; COMMIT
 * TRANSACTION;`. The return value is the result of the LAST statement,
 * which the caller can shape with a final `RETURN $...` line.
 *
 * Use for: CREATE entity + CREATE external_ref (must both succeed),
 * CREATE fact + cascade-MERGE on competing facts (partial state is bad).
 */
export interface TxBuilder {
  /** Append a statement to the transaction. Returns the builder for chaining. */
  add(sql: string): TxBuilder;
  /** Bind a parameter; the same `vars` map is shared across all statements. */
  bind(name: string, value: unknown): TxBuilder;
}

export async function runTransaction<T>(
  db: Surreal,
  build: (tx: TxBuilder) => void,
): Promise<T> {
  const stmts: string[] = [];
  const vars: Record<string, unknown> = {};
  const builder: TxBuilder = {
    add(sql) {
      stmts.push(sql.trim().replace(/;\s*$/, ''));
      return builder;
    },
    bind(name, value) {
      vars[name] = value;
      return builder;
    },
  };
  build(builder);

  // Compose: BEGIN; <stmt>; <stmt>; ...; COMMIT;
  const sql = ['BEGIN TRANSACTION', ...stmts, 'COMMIT TRANSACTION']
    .map((s) => s.replace(/;\s*$/, ''))
    .join(';\n') + ';';

  // SurrealDB returns one result entry per statement. BEGIN/COMMIT are
  // suppressed in the result list — the array maps 1:1 to the user's
  // statements. We return the last user-statement's result.
  const result = await db.query<unknown[]>(sql, vars);
  const arr = result as unknown[];
  return arr[arr.length - 1] as T;
}

/**
 * Detect SurrealDB unique-index violation. The driver surfaces these
 * as plain Errors with the index name embedded in the message; we
 * match on the marker text rather than coupling to a specific class.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message;
  return (
    m.includes('already contains') || // "already contains a record with id ..."
    m.includes('Database index') ||   // "Database index `xxx` already contains ..."
    m.includes('IndexExists')
  );
}

/**
 * Detect SurrealDB optimistic-concurrency read conflict. Surreal's
 * datastore aborts a transaction whose read-set was invalidated by a
 * concurrent committer. The surfaced messages cluster into:
 *
 *   - "Transaction read conflict" — explicit OCC abort
 *   - "failed transaction" — composed multi-statement CANCEL after one
 *     statement aborted (the underlying cause is the previous one in
 *     the result set, but the surfaced top-level message is generic)
 *   - "transaction wrote at the same key" / "datastore transaction"
 *     — variants from the rocksdb engine for write-write contention
 *
 * All are retriable from the caller's perspective: re-running the
 * same logic against the now-updated state either succeeds, returns
 * the racing-caller's row on read, or surfaces a unique violation
 * (which `isUniqueViolation` then catches).
 */
export function isReadConflict(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message;
  return (
    m.includes('Transaction read conflict') ||
    m.includes('failed transaction') ||
    m.includes('datastore transaction') ||
    m.includes('wrote at the same key')
  );
}

/**
 * Retry a body on transient concurrency failures: unique-index
 * violations OR optimistic-concurrency read conflicts. Both arise
 * from the same SELECT-then-CREATE race window — under contention,
 * one tx commits and others either (a) see a duplicate index entry
 * (unique violation) or (b) have their read-set invalidated (read
 * conflict). Both are retriable: re-run the closure, which on its
 * second SELECT will see the racing caller's commit and either
 * short-circuit (read path) or write fresh state (rare).
 *
 * We use exponential backoff with jitter so a herd of FANOUT
 * retries doesn't synchronise into a second collision wave.
 */
export async function retryOnUniqueViolation<T>(
  fn: () => Promise<T>,
  attempts = 8,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isUniqueViolation(err) && !isReadConflict(err)) throw err;
      lastErr = err;
      if (i < attempts - 1) {
        // Exponential backoff with full jitter: 10..20, 20..40, 40..80,
        // 80..160, 160..320, 320..640, 640..1280 ms. Worst case: ~2.5s
        // total backoff before giving up — enough headroom for FANOUT
        // collisions to drain on a single-threaded rocksdb backend.
        const baseMs = 10 * Math.pow(2, i);
        const jitter = Math.random() * baseMs;
        await new Promise((r) => setTimeout(r, baseMs + jitter));
      }
    }
  }
  throw lastErr;
}
