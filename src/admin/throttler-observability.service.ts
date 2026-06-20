import { Injectable } from '@nestjs/common';

interface RouteCounters {
  total: number;
  throttled: number;
  lastSeenMs: number;
}

interface ActorCounters {
  total: number;
  throttled: number;
  lastSeenMs: number;
}

export interface ThrottledEvent {
  ts: string;
  actor: string;
  method: string;
  path: string;
  bucket: 'default' | 'expensive' | 'unknown';
}

/**
 * Lightweight throttler observability layer. nestjs/throttler stores
 * its raw counters in an in-memory ThrottlerStorage that exposes only
 * `increment` — there's no read API for "current fill of bucket X".
 * We work around that by counting hits + 429s ourselves at the
 * HTTP-interceptor layer so the admin UI can answer:
 *   - who's close to limit (top-talkers leaderboard)
 *   - 429 rate per route in the last 60s
 *   - last-N rejections with actor + path
 *
 * Counters are window-bounded (last 1h trailing) — older entries get
 * pruned on each record() so memory stays flat. Recent-rejections ring
 * is capped at 200.
 */
@Injectable()
export class ThrottlerObservabilityService {
  private readonly perRoute = new Map<string, RouteCounters>();
  private readonly perActor = new Map<string, ActorCounters>();
  private readonly recentThrottled: ThrottledEvent[] = [];
  private readonly recentCap = 200;
  private readonly trailingWindowMs = 60 * 60_000; // 1h

  record(input: {
    actor: string;
    method: string;
    path: string;
    status: number;
    throttled: boolean;
  }): void {
    const now = Date.now();
    const routeKey = `${input.method} ${input.path}`;
    const route = this.perRoute.get(routeKey) ?? {
      total: 0,
      throttled: 0,
      lastSeenMs: now,
    };
    route.total += 1;
    if (input.throttled) route.throttled += 1;
    route.lastSeenMs = now;
    this.perRoute.set(routeKey, route);

    const actor = this.perActor.get(input.actor) ?? {
      total: 0,
      throttled: 0,
      lastSeenMs: now,
    };
    actor.total += 1;
    if (input.throttled) actor.throttled += 1;
    actor.lastSeenMs = now;
    this.perActor.set(input.actor, actor);

    if (input.throttled) {
      this.recentThrottled.unshift({
        ts: new Date().toISOString(),
        actor: input.actor,
        method: input.method,
        path: input.path,
        bucket: this.guessBucket(input.path),
      });
      if (this.recentThrottled.length > this.recentCap) {
        this.recentThrottled.length = this.recentCap;
      }
    }

    this.prune(now);
  }

  snapshot(): {
    topRoutes: Array<{
      route: string;
      total: number;
      throttled: number;
      throttledRate: number;
    }>;
    topActors: Array<{
      actor: string;
      total: number;
      throttled: number;
      throttledRate: number;
    }>;
    recentThrottled: ThrottledEvent[];
  } {
    const topRoutes = [...this.perRoute.entries()]
      .map(([route, c]) => ({
        route,
        total: c.total,
        throttled: c.throttled,
        throttledRate: c.total === 0 ? 0 : c.throttled / c.total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
    const topActors = [...this.perActor.entries()]
      .map(([actor, c]) => ({
        actor,
        total: c.total,
        throttled: c.throttled,
        throttledRate: c.total === 0 ? 0 : c.throttled / c.total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
    return {
      topRoutes,
      topActors,
      recentThrottled: this.recentThrottled.slice(0, 50),
    };
  }

  private prune(now: number): void {
    const cutoff = now - this.trailingWindowMs;
    for (const [k, v] of this.perRoute) {
      if (v.lastSeenMs < cutoff) this.perRoute.delete(k);
    }
    for (const [k, v] of this.perActor) {
      if (v.lastSeenMs < cutoff) this.perActor.delete(k);
    }
  }

  private guessBucket(path: string): 'default' | 'expensive' | 'unknown' {
    // Mirror the @Throttle({expensive:…}) annotations we know about
    // statically. New annotations need updating here — out-of-band
    // surface, accepted.
    const expensive = [
      '/v1/synthesize',
      '/v1/multi-hop',
      '/v1/ingest/mention',
      '/v1/dreams/run',
      '/v1/admin/demo/chat',
      '/v1/admin/demo/search',
    ];
    if (expensive.some((p) => path.startsWith(p))) return 'expensive';
    return 'default';
  }
}
