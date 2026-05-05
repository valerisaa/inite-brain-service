import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Surreal from 'surrealdb';
import { SurrealService } from '../db/surreal.service';
import { EmbedderService } from '../ai/embedder.service';
import { IngestFactDto } from './dto/ingest-fact.dto';
import {
  ConflictConfig,
  policyFor,
  scoreFact,
  SOURCE_TRUST,
} from './conflict-resolver';

export type IngestOutcome =
  | 'INSERTED'
  | 'SUPERSEDED'
  | 'COMPETING'
  | 'REJECTED';

export interface IngestResult {
  factId: string | null;
  outcome: IngestOutcome;
  supersededFactIds?: string[];
  competingFactIds?: string[];
  reason?: string;
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private readonly conflict: ConflictConfig;

  constructor(
    private readonly surreal: SurrealService,
    private readonly embedder: EmbedderService,
    private readonly configService: ConfigService,
  ) {
    this.conflict = {
      similarityThreshold: this.cfgNum('CONFLICT_SIMILARITY_THRESHOLD', 0.85),
      weights: {
        confidence:  this.cfgNum('CONFLICT_WEIGHT_CONFIDENCE',  0.30),
        sourceTrust: this.cfgNum('CONFLICT_WEIGHT_SOURCE_TRUST', 0.40),
        recency:     this.cfgNum('CONFLICT_WEIGHT_RECENCY',     0.20),
        authority:   this.cfgNum('CONFLICT_WEIGHT_AUTHORITY',   0.10),
      },
      marginForSupersede: this.cfgNum('CONFLICT_MARGIN_SUPERSEDE',  0.15),
      rejectThreshold:    this.cfgNum('CONFLICT_REJECT_THRESHOLD', 0.30),
    };
  }

  async ingestFact(companyId: string, dto: IngestFactDto): Promise<IngestResult> {
    return this.surreal.withCompany(companyId, async (db) => {
      // 1. Resolve entity (create if needed)
      const entityId = await this.resolveOrCreateEntity(db, dto);

      // 2. Compute embedding from object representation
      const embeddingText = `${dto.predicate}: ${dto.object}`;
      const embedding = await this.embedder.embed(embeddingText);

      // 3. Predicate policy
      const policy = policyFor(dto.predicate);

      // 4. Score the new fact
      const newScore = scoreFact(
        {
          confidence: dto.confidence ?? 0.7,
          sourceTrust: this.sourceTrustFor(dto.source),
          recordedAt: new Date(),
          authority: 0,
        },
        this.conflict,
      );

      // Reject below threshold (only matters for bitemporal — append-only never rejects)
      if (policy.semantics === 'bitemporal' && newScore < this.conflict.rejectThreshold) {
        await db.create('ingest_dead_letter', {
          payload: dto as any,
          reason: `score ${newScore.toFixed(3)} below reject threshold ${this.conflict.rejectThreshold}`,
        });
        return { factId: null, outcome: 'REJECTED', reason: 'low_score' };
      }

      // 5. Find contradicting active facts (same entity + same predicate)
      const contradictsQuery = `
        SELECT id, predicate, object, confidence, recordedAt, source, embedding
        FROM knowledge_fact
        WHERE entityId = $entityId
          AND predicate = $predicate
          AND status = 'active'
          AND retractedAt IS NONE
      `;
      const [existing] = await db.query<any[]>(contradictsQuery, {
        entityId,
        predicate: dto.predicate,
      });
      const candidates: any[] = (existing as any[]) ?? [];

      // For append_only — never compete, just insert.
      // For single_active — every existing wins-or-loses without similarity check.
      // For bitemporal — only compete when semantically similar.
      let competing: any[];
      if (policy.semantics === 'append_only') {
        competing = [];
      } else if (policy.semantics === 'single_active') {
        competing = candidates;
      } else {
        // bitemporal — compare via embedding cosine
        competing = candidates.filter(c => {
          if (!c.embedding) return false;
          return cosine(c.embedding, embedding) >= this.conflict.similarityThreshold;
        });
      }

      // 6. Insert the new fact
      const factPayload = {
        entityId: entityId as any,
        predicate: dto.predicate,
        object: typeof dto.object === 'string' ? dto.object : JSON.stringify(dto.object),
        confidence: dto.confidence ?? 0.7,
        validFrom: new Date(dto.validFrom),
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        source: dto.source,
        embedding,
        status: 'active',
      };
      const created = await db.create('knowledge_fact', factPayload);
      const newFactId = (Array.isArray(created) ? created[0]?.id : (created as any)?.id) as string;

      if (competing.length === 0) {
        return { factId: String(newFactId), outcome: 'INSERTED' };
      }

      // 7. Score the competition
      const competingScored = competing.map(c => ({
        id: String(c.id),
        score: scoreFact(
          {
            confidence: c.confidence,
            sourceTrust: this.sourceTrustFor(c.source),
            recordedAt: new Date(c.recordedAt),
            authority: 0,
          },
          this.conflict,
        ),
      }));
      const bestOpponent = competingScored.reduce((a, b) => (a.score > b.score ? a : b));

      // 8. Decide outcome
      if (
        policy.semantics === 'single_active' ||
        newScore >= bestOpponent.score + this.conflict.marginForSupersede
      ) {
        // SUPERSEDED — retract all competing
        for (const c of competingScored) {
          await db.merge(c.id as any, {
            status: 'superseded',
            retractedAt: new Date(),
            retractionReason: 'superseded',
            retractedBy: 'system',
            supersededBy: newFactId as any,
            validUntil: factPayload.validFrom,
          });
        }
        return {
          factId: String(newFactId),
          outcome: 'SUPERSEDED',
          supersededFactIds: competingScored.map(c => c.id),
        };
      }

      // COMPETING — both stay active, mark status
      await db.merge(newFactId as any, { status: 'competing' });
      for (const c of competingScored) {
        await db.merge(c.id as any, { status: 'competing' });
      }
      return {
        factId: String(newFactId),
        outcome: 'COMPETING',
        competingFactIds: competingScored.map(c => c.id),
      };
    });
  }

  private async resolveOrCreateEntity(db: Surreal, dto: IngestFactDto): Promise<string> {
    if ('entityId' in dto.entityRef) {
      return dto.entityRef.entityId;
    }
    const ref = dto.entityRef as { vertical: string; id: string };
    const refKey = `${ref.vertical}.${ref.id}`;
    // Look up by externalRefs[refKey]
    const [rows] = await db.query<any[][]>(
      `SELECT id FROM knowledge_entity WHERE externalRefs[$key] = $val LIMIT 1`,
      { key: refKey, val: ref.id },
    );
    if (rows && rows[0]) {
      return String(rows[0].id);
    }
    // Create stub entity — canonicalName defaulted to ref id; LLM extractor
    // will refine in a future PR.
    const created = await db.create('knowledge_entity', {
      type: 'other',
      canonicalName: ref.id,
      externalRefs: { [refKey]: ref.id },
    });
    return String(Array.isArray(created) ? created[0]?.id : (created as any)?.id);
  }

  private sourceTrustFor(source: { vertical: string; eventId?: string; messageId?: string }): number {
    // Heuristic: derive a trust label from source shape.
    if (source.eventId?.startsWith('billing.'))   return SOURCE_TRUST.billing_event;
    if (source.eventId?.startsWith('incidents.')) return SOURCE_TRUST.incidents_event;
    if (source.eventId?.startsWith('auth.'))      return SOURCE_TRUST.auth_event;
    if (source.messageId)                         return SOURCE_TRUST.inbox_extraction;
    return SOURCE_TRUST.default;
  }

  private cfgNum(key: string, fallback: number): number {
    const v = this.configService.get<string>(key);
    if (v === undefined) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
