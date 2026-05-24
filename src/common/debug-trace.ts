import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { Observable, map } from 'rxjs';

export interface DebugSpan {
  id: string;
  parentId?: string;
  name: string;
  startedAt: number;
  durationMs?: number;
  attributes?: Record<string, unknown>;
  error?: string;
}

export interface DebugArtifact {
  spanId?: string;
  name: string;
  ts: number;
  value: unknown;
}

export interface DebugContext {
  requestId: string;
  startedAt: number;
  spans: DebugSpan[];
  artifacts: DebugArtifact[];
  /** Stack of currently-open span ids (innermost on top). */
  stack: string[];
}

export interface DebugTraceSnapshot {
  requestId: string;
  ts: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  companyId?: string;
  spans: DebugSpan[];
  artifacts: DebugArtifact[];
}

const als = new AsyncLocalStorage<DebugContext>();

export function getDebugContext(): DebugContext | undefined {
  return als.getStore();
}

const MAX_ARTIFACT_SIZE = 32 * 1024;

function safeArtifact(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  try {
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    if (json.length <= MAX_ARTIFACT_SIZE) {
      return typeof value === 'string' ? value : value;
    }
    return {
      __truncated: true,
      preview: json.slice(0, MAX_ARTIFACT_SIZE),
      originalSize: json.length,
    };
  } catch {
    return { __unserializable: true, type: typeof value };
  }
}

export async function traceSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, unknown>,
): Promise<T> {
  const ctx = als.getStore();
  if (!ctx) return fn();

  const id = randomUUID();
  const parentId = ctx.stack[ctx.stack.length - 1];
  const startedAt = Date.now();
  const span: DebugSpan = { id, parentId, name, startedAt, attributes };
  ctx.spans.push(span);
  ctx.stack.push(id);
  try {
    const out = await fn();
    span.durationMs = Date.now() - startedAt;
    return out;
  } catch (err) {
    span.durationMs = Date.now() - startedAt;
    span.error = (err as Error)?.message ?? String(err);
    throw err;
  } finally {
    const top = ctx.stack[ctx.stack.length - 1];
    if (top === id) ctx.stack.pop();
  }
}

export function traceArtifact(name: string, value: unknown): void {
  const ctx = als.getStore();
  if (!ctx) return;
  const spanId = ctx.stack[ctx.stack.length - 1];
  ctx.artifacts.push({
    spanId,
    name,
    ts: Date.now(),
    value: safeArtifact(value),
  });
}

export function debugTraceMiddleware() {
  return function (req: Request, _res: Response, next: NextFunction) {
    if (req.headers['x-brain-debug'] !== '1') return next();
    const ctx: DebugContext = {
      requestId: randomUUID(),
      startedAt: Date.now(),
      spans: [],
      artifacts: [],
      stack: [],
    };
    (req as unknown as { __debugCtx?: DebugContext }).__debugCtx = ctx;
    als.run(ctx, () => next());
  };
}

@Injectable()
export class TraceBufferService {
  private buffer: DebugTraceSnapshot[] = [];
  private readonly capacity = 100;

  add(snapshot: DebugTraceSnapshot): void {
    this.buffer.unshift(snapshot);
    if (this.buffer.length > this.capacity) {
      this.buffer.length = this.capacity;
    }
  }

  list(): Array<Omit<DebugTraceSnapshot, 'spans' | 'artifacts'>> {
    return this.buffer.map(({ spans: _s, artifacts: _a, ...rest }) => rest);
  }

  get(requestId: string): DebugTraceSnapshot | undefined {
    return this.buffer.find((s) => s.requestId === requestId);
  }
}

@Injectable()
export class DebugTraceInterceptor implements NestInterceptor {
  constructor(private readonly traceBuffer: TraceBufferService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = als.getStore();
    if (!ctx) return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const auth = (req as unknown as {
      brainAuth?: { companyId: string; scopes: string[] };
    }).brainAuth;
    const isAdmin = !!auth?.scopes?.includes('brain:admin');

    return next.handle().pipe(
      map((body) => {
        const totalMs = Date.now() - ctx.startedAt;
        const snapshot: DebugTraceSnapshot = {
          requestId: ctx.requestId,
          ts: new Date(ctx.startedAt).toISOString(),
          method: req.method,
          path: req.originalUrl ?? req.url,
          status: res.statusCode,
          durationMs: totalMs,
          companyId: auth?.companyId,
          spans: ctx.spans,
          artifacts: ctx.artifacts,
        };
        this.traceBuffer.add(snapshot);

        if (!isAdmin) return body;

        if (body && typeof body === 'object' && !Array.isArray(body)) {
          return {
            ...body,
            __trace: {
              requestId: ctx.requestId,
              totalMs,
              spans: ctx.spans,
              artifacts: ctx.artifacts,
            },
          };
        }
        return {
          data: body,
          __trace: {
            requestId: ctx.requestId,
            totalMs,
            spans: ctx.spans,
            artifacts: ctx.artifacts,
          },
        };
      }),
    );
  }
}
