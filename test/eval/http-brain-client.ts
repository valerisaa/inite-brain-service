/**
 * Minimal HTTP-only client for the quality-eval harness.
 *
 * Why this exists: the previous code path imported `BrainClient` from
 * `@inite/knowledge`, which is a tsconfig alias to a sibling
 * `inite-shared` repo. That dragged a checkout-sibling-private-repo
 * step into the CI workflow and broke quality-eval whenever the
 * cross-repo PAT was unavailable. The eval only needs HTTP calls to
 * a running brain process, so this file inlines a tiny client that
 * speaks /v1/* directly via fetch and exposes the same surface the
 * runner expected.
 *
 * Only the seven methods the eval actually uses are implemented:
 *   - search()
 *   - synthesize()
 *   - ingest.fact / ingest.link / ingest.mention
 *   - facts.retract
 *   - entities.forget
 *
 * Any other SDK call belongs in `@inite/knowledge` and shouldn't be
 * invoked from eval-runner code.
 */

export interface HttpBrainClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Optional fetch implementation — Node 22 ships a global one. */
  fetchImpl?: typeof fetch;
}

/**
 * Minimal SearchHit shape — mirrors src/search/search.types.ts but
 * kept inline so the eval harness has no dependency on production
 * code. Fields not used by eval runners are open via `[k: string]: unknown`.
 */
export interface EvalSearchHit {
  entityId: string;
  entityType: string;
  canonicalName: string;
  externalRefs: Record<string, string>;
  facts: Array<{
    factId: string;
    predicate: string;
    object: string;
    confidence: number;
    score: number;
    [k: string]: unknown;
  }>;
  score: number;
  [k: string]: unknown;
}

export interface EvalSearchResponse {
  results: EvalSearchHit[];
}

export interface EvalSynthesizeResponse {
  answer: string | null;
  reason?: string;
  citations: Array<{ factId: string; [k: string]: unknown }>;
  results: EvalSearchHit[];
  [k: string]: unknown;
}

export interface EvalIngestResult {
  factId: string | null;
  outcome: string;
  [k: string]: unknown;
}

export class HttpBrainClient {
  readonly ingest: IngestSurface;
  readonly facts: FactsSurface;
  readonly entities: EntitiesSurface;
  private readonly call: <T>(method: string, path: string, body?: unknown) => Promise<T>;

  constructor(opts: HttpBrainClientOptions) {
    const f = opts.fetchImpl ?? fetch;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    };
    this.call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      const res = await f(`${opts.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${method} ${path}: ${text}`);
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) return undefined as unknown as T;
      return (await res.json()) as T;
    };
    this.ingest = {
      fact: (body: unknown) =>
        this.call<EvalIngestResult>('POST', '/v1/ingest/fact', body),
      link: (body: unknown) =>
        this.call<{ [k: string]: unknown }>('POST', '/v1/ingest/link', body),
      mention: (body: unknown) =>
        this.call<{ [k: string]: unknown }>(
          'POST',
          '/v1/ingest/mention',
          body,
        ),
    };
    this.facts = {
      retract: (factId: string, body: unknown) =>
        this.call<{ [k: string]: unknown }>(
          'POST',
          `/v1/facts/${encodeURIComponent(factId)}/retract`,
          body,
        ),
    };
    this.entities = {
      forget: (entityId: string, body: unknown) =>
        this.call<{ [k: string]: unknown }>(
          'POST',
          `/v1/entities/${encodeURIComponent(entityId)}/forget`,
          body,
        ),
    };
  }

  async search(body: unknown): Promise<EvalSearchResponse> {
    return this.call<EvalSearchResponse>('POST', '/v1/search', body);
  }

  async synthesize(body: unknown): Promise<EvalSynthesizeResponse> {
    return this.call<EvalSynthesizeResponse>('POST', '/v1/synthesize', body);
  }
}

interface IngestSurface {
  fact(body: unknown): Promise<EvalIngestResult>;
  link(body: unknown): Promise<{ [k: string]: unknown }>;
  mention(body: unknown): Promise<{ [k: string]: unknown }>;
}

interface FactsSurface {
  retract(
    factId: string,
    body: unknown,
  ): Promise<{ [k: string]: unknown }>;
}

interface EntitiesSurface {
  forget(
    entityId: string,
    body: unknown,
  ): Promise<{ [k: string]: unknown }>;
}
