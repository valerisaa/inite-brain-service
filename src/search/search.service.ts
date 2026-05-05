import { Injectable, Logger } from '@nestjs/common';
import { Surreal } from 'surrealdb';
import { SurrealService } from '../db/surreal.service';
import { EmbedderService } from '../ai/embedder.service';
import { SearchDto, SearchMode } from './dto/search.dto';
import { policyFor } from '../ingest/conflict-resolver';

export interface SearchHit {
  entityId: string;
  entityType: string;
  canonicalName: string;
  externalRefs: Record<string, string>;
  facts: Array<{
    factId: string;
    predicate: string;
    object: string;
    confidence: number;
    validFrom: string;
    validUntil?: string;
    status: string;
    score: number;
  }>;
  score: number;
}

interface FactRow {
  id: unknown;
  entityId: unknown;
  predicate: string;
  object: string;
  confidence: number;
  validFrom: string;
  validUntil?: string;
  recordedAt: string;
  retractedAt?: string;
  status: string;
  source: any;
  // Hydrated via FETCH — entity record inlined.
  entity?: {
    id: unknown;
    type: string;
    canonicalName: string;
    externalRefs?: Record<string, string>;
  };
  // One of these is set per row depending on which leg surfaced it;
  // hybrid mode merges both and lets RRF fuse. Field names sidestep the
  // SurrealQL `vec::*` and `lex::*` namespace prefixes — using `vec` or
  // `lex` as a SELECT alias confuses the parser's `ORDER BY` resolver
  // and silently returns rows in record-id order instead of by score.
  simScore?: number;
  bm25Score?: number;
}

// Convex combination weight for hybrid fusion. 0.5 = equal trust in
// vector and lexical legs. We deliberately avoid pure rank-based RRF
// (Cormack et al. 2009) here: the ranks are too coarse for our
// commonly-tiny per-tenant result sets — a perfect cosine match (1.0)
// gets compressed to rank 1 with score 1/61, indistinguishable from
// a near-miss at rank 1 with cosine 0.05. Score-level fusion preserves
// the magnitude difference, which matters for downstream decay-and-
// confidence weighting.
const HYBRID_VECTOR_WEIGHT = 0.5;

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly surreal: SurrealService,
    private readonly embedder: EmbedderService,
  ) {}

  async search(
    companyId: string,
    dto: SearchDto,
    callerScopes: string[],
  ): Promise<{ results: SearchHit[] }> {
    const limit = dto.limit ?? 10;
    const asOf = dto.asOf ? new Date(dto.asOf) : null;
    const includeRetracted = dto.includeRetracted ?? false;
    const includeContested = dto.includeContested ?? true;
    const mode: SearchMode = dto.searchMode ?? 'hybrid';

    // Pull more candidates than `limit` so RRF / decay weighting can
    // re-rank without starving the top-K. 5× is empirically a good
    // trade-off — enough headroom for fusion to matter, not so many
    // that we shovel embeddings across the wire for nothing.
    const candidateK = Math.min(limit * 5, 200);

    return this.surreal.withCompany(companyId, async (db) => {
      // Bitemporal predicates pushed into WHERE — no JS post-filter.
      // The composite (entityId, status, recordedAt) index covers
      // entity scope; full-table scans here only run when there's no
      // entity filter, which is the common case for free-text search.
      const baseWhere = this.buildBaseWhere(dto, asOf, includeRetracted, includeContested);

      const [vectorRows, lexicalRows] = await Promise.all([
        mode === 'lexical' ? Promise.resolve([] as FactRow[]) : this.vectorLeg(db, dto.query, candidateK, baseWhere),
        mode === 'vector' ? Promise.resolve([] as FactRow[]) : this.lexicalLeg(db, dto.query, candidateK, baseWhere),
      ]);

      // Fuse — vector and lexical lists are joined by fact id; the
      // resulting per-fact score is RRF(vector_rank, lexical_rank)
      // when both legs contributed, or the single-leg score otherwise.
      const fused = this.fuse(vectorRows, lexicalRows, mode);

      // Apply policy gates AFTER fusion: predicate filter, scope gate,
      // confidence floor. Doing this post-fusion preserves recall —
      // a query that semantically matches but is filtered by scope
      // returns zero rather than silently demoting.
      const filtered = fused.filter((row) => this.passesPolicy(row, dto, callerScopes));

      // Decay-weighted final score uses predicate half-life. Vector
      // and lexical fusion give us a normalized retrieval score in
      // [0, 1); we multiply by decay × confidence as the final
      // ranking signal, same shape as before.
      const now = Date.now();
      const scored = filtered.map((row) => {
        const policy = policyFor(row.predicate);
        const ageDays = (now - new Date(row.recordedAt).getTime()) / 86_400_000;
        const decay = policy.decayHalfLifeDays === null
          ? 1
          : Math.exp((-Math.LN2 * ageDays) / policy.decayHalfLifeDays);
        const finalScore = row.fusedScore * decay * row.confidence;
        return { row, score: finalScore };
      });

      // Group by entity, keep best fact per entity for ranking.
      const byEntity = new Map<string, { entityId: string; bestScore: number; facts: typeof scored }>();
      for (const sf of scored) {
        const eid = String(sf.row.entityId);
        const bucket = byEntity.get(eid) ?? { entityId: eid, bestScore: 0, facts: [] };
        bucket.facts.push(sf);
        if (sf.score > bucket.bestScore) bucket.bestScore = sf.score;
        byEntity.set(eid, bucket);
      }

      const topEntities = [...byEntity.values()]
        .sort((a, b) => b.bestScore - a.bestScore)
        .slice(0, limit);

      const results: SearchHit[] = topEntities
        .filter((e) => {
          if (!dto.entityTypes) return true;
          const ent = e.facts[0]?.row.entity;
          return ent ? dto.entityTypes.includes(ent.type) : false;
        })
        .map((e) => {
          const ent = e.facts[0]?.row.entity ?? {
            id: e.entityId,
            type: 'other',
            canonicalName: e.entityId,
            externalRefs: {},
          };
          return {
            entityId: e.entityId,
            entityType: ent.type,
            canonicalName: ent.canonicalName,
            externalRefs: ent.externalRefs ?? {},
            facts: e.facts
              .sort((a, b) => b.score - a.score)
              .slice(0, 5)
              .map(({ row, score }) => ({
                factId: String(row.id),
                predicate: row.predicate,
                object: row.object,
                confidence: row.confidence,
                validFrom: row.validFrom,
                validUntil: row.validUntil ?? undefined,
                status: row.status,
                score,
              })),
            score: e.bestScore,
          };
        });

      return { results };
    });
  }

  // ── Retrieval legs ───────────────────────────────────────────────

  /**
   * Vector leg — cosine similarity over `embedding`. The inline
   * projection `entityId.{...} AS entity` reads the linked entity
   * record in the same query, so no separate hydration round-trip is
   * needed. We deliberately don't add `FETCH entityId` — that would
   * overwrite the `entityId` field in-place with the entity object,
   * breaking `String(row.entityId)` for the grouping pass below.
   * The inline-projection form keeps `entityId` as a record link
   * AND surfaces `entity` as a hydrated record.
   */
  private async vectorLeg(
    db: Surreal,
    query: string,
    k: number,
    baseWhere: { sql: string; params: Record<string, unknown> },
  ): Promise<FactRow[]> {
    const queryEmbedding = await this.embedder.embed(query);
    const sql = `
      SELECT
        id, entityId, predicate, object, confidence,
        validFrom, validUntil, recordedAt, retractedAt, status, source,
        entityId.{id, type, canonicalName, externalRefs} AS entity,
        vector::similarity::cosine(embedding, $q) AS simScore
      FROM knowledge_fact
      WHERE embedding != NONE
        ${baseWhere.sql}
      ORDER BY simScore DESC
      LIMIT $k
    `;
    const [rows] = await db.query<[FactRow[]]>(sql, {
      ...baseWhere.params,
      q: queryEmbedding,
      k,
    });
    return (rows as FactRow[]) ?? [];
  }

  /**
   * Lexical leg — BM25 over the `object` field, surfaced via the
   * `fact_object_search_idx` SEARCH index. The `@1@` operator binds
   * to `search::score(1)` so callers get the index's BM25 score,
   * not a flat boolean match. This catches exact-token queries
   * (transaction ids, structured strings) that vector search
   * routinely misses.
   */
  private async lexicalLeg(
    db: Surreal,
    query: string,
    k: number,
    baseWhere: { sql: string; params: Record<string, unknown> },
  ): Promise<FactRow[]> {
    const sql = `
      SELECT
        id, entityId, predicate, object, confidence,
        validFrom, validUntil, recordedAt, retractedAt, status, source,
        entityId.{id, type, canonicalName, externalRefs} AS entity,
        search::score(1) AS bm25Score
      FROM knowledge_fact
      WHERE object @1@ $query
        ${baseWhere.sql}
      ORDER BY bm25Score DESC
      LIMIT $k
    `;
    try {
      const [rows] = await db.query<[FactRow[]]>(sql, {
        ...baseWhere.params,
        query,
        k,
      });
      return (rows as FactRow[]) ?? [];
    } catch (err) {
      // Fresh tenants without the SEARCH index (e.g. test fixtures
      // pre-dating this migration) shouldn't break free-text search.
      // Fail soft to vector-only by returning [].
      this.logger.warn(`Lexical leg fell back to empty: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Score-level convex fusion. Each leg's raw score is normalised to
   * [0, 1] and the legs are combined linearly:
   *
   *   hybrid = w_v * vec_norm + w_l * lex_norm
   *
   * where w_v + w_l = 1. A row appearing in both legs gets the full
   * weighted sum; a row appearing in only one leg is implicitly scored
   * 0 by the missing leg, so it can still surface but doesn't dominate.
   *
   * Why not RRF: rank-based fusion compresses score magnitude. For our
   * typical per-tenant scale (hundreds of facts), an identical-text
   * match (cosine ≈ 1.0) and a weak match (cosine ≈ 0.05) both
   * occupy rank 1 of their respective candidate sets if no better
   * candidate exists, so RRF treats them as equivalent — which lets
   * downstream confidence weighting flip the leader. Score-level
   * fusion preserves the cosine magnitude exactly.
   */
  private fuse(
    vectorRows: FactRow[],
    lexicalRows: FactRow[],
    mode: SearchMode,
  ): Array<FactRow & { fusedScore: number }> {
    const merged = new Map<string, FactRow & { fusedScore: number }>();

    if (mode === 'vector') {
      vectorRows.forEach((r) => {
        merged.set(String(r.id), {
          ...r,
          fusedScore: this.normalizeVec(r.simScore ?? 0),
        });
      });
      return [...merged.values()];
    }

    if (mode === 'lexical') {
      lexicalRows.forEach((r) => {
        merged.set(String(r.id), {
          ...r,
          fusedScore: this.normalizeLex(r.bm25Score ?? 0),
        });
      });
      return [...merged.values()];
    }

    // Hybrid — convex combination on normalised scores.
    const w_v = HYBRID_VECTOR_WEIGHT;
    const w_l = 1 - HYBRID_VECTOR_WEIGHT;
    vectorRows.forEach((r) => {
      const id = String(r.id);
      const vScore = this.normalizeVec(r.simScore ?? 0);
      merged.set(id, { ...r, fusedScore: w_v * vScore });
    });
    lexicalRows.forEach((r) => {
      const id = String(r.id);
      const lScore = this.normalizeLex(r.bm25Score ?? 0);
      const existing = merged.get(id);
      if (existing) {
        existing.fusedScore += w_l * lScore;
        existing.bm25Score = r.bm25Score;
      } else {
        merged.set(id, { ...r, fusedScore: w_l * lScore });
      }
    });
    return [...merged.values()];
  }

  /** Cosine in [-1, 1] → [0, 1] with negative-correlation clamped to 0. */
  private normalizeVec(s: number): number {
    return s <= 0 ? 0 : s > 1 ? 1 : s;
  }

  /**
   * Squash BM25 scores into [0, 1] via a saturation curve. BM25 is
   * unbounded (a 5-term match on a short doc can score 10+), so we
   * pass it through x/(1+x) to keep the lexical-only mode's final
   * score on the same scale as vector cosine.
   */
  private normalizeLex(s: number): number {
    return s <= 0 ? 0 : s / (1 + s);
  }

  private buildBaseWhere(
    dto: SearchDto,
    asOf: Date | null,
    includeRetracted: boolean,
    includeContested: boolean,
  ): { sql: string; params: Record<string, unknown> } {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};

    if (!includeRetracted) clauses.push(`AND retractedAt IS NONE`);
    if (!includeContested) clauses.push(`AND status != 'competing'`);
    if (dto.minConfidence !== undefined) {
      clauses.push(`AND confidence >= $minConfidence`);
      params.minConfidence = dto.minConfidence;
    }
    if (dto.predicates && dto.predicates.length > 0) {
      clauses.push(`AND predicate INSIDE $predicates`);
      params.predicates = dto.predicates;
    }
    if (asOf) {
      // recordedAt <= asOf  AND  (retractedAt IS NONE OR retractedAt > asOf)
      // AND validFrom <= asOf  AND  (validUntil IS NONE OR validUntil > asOf)
      clauses.push(
        `AND recordedAt <= $asOf
         AND (retractedAt IS NONE OR retractedAt > $asOf)
         AND validFrom <= $asOf
         AND (validUntil IS NONE OR validUntil > $asOf)`,
      );
      params.asOf = asOf;
    }

    return { sql: clauses.join('\n        '), params };
  }

  private passesPolicy(row: FactRow, dto: SearchDto, callerScopes: string[]): boolean {
    const policy = policyFor(row.predicate);
    if (policy.requiresScope && !callerScopes.includes(policy.requiresScope)) {
      return false;
    }
    return true;
  }
}
