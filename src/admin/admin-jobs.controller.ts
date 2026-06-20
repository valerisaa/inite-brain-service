import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ApiKeyGuard, RequireScopes } from '../auth/api-key.guard';
import type { AuthenticatedRequest } from '../auth/api-key.types';
import {
  JobRunService,
  JobStatus,
  JobType,
} from '../jobs/job-run.service';
import { DreamsService } from '../dreams/dreams.service';
import { CalibrationRefitService } from '../ai/calibration/calibration-refit.service';
import { ChangefeedConsumerService } from '../audit/changefeed-consumer.service';
import { SurrealService } from '../db/surreal.service';
import { ApiKeyService } from '../auth/api-key.service';

/**
 * Scheduler / jobs / maintenance surface.
 *
 *   /v1/admin/jobs              — list/get + SSE stream of long-running jobs
 *   /v1/admin/scheduler         — registered cron entries with last/next fire
 *   /v1/admin/changefeed/state  — consumer lag + cursor table
 *   /v1/admin/maintenance/...   — manual triggers
 *
 * Kept in its own controller (rather than bolted onto AdminController)
 * because the operator workflow is genuinely distinct: this is the
 * "what's running right now / what will run next / when did X last
 * complete" cockpit.
 */
@Controller('v1/admin')
@UseGuards(ApiKeyGuard)
export class AdminJobsController {
  constructor(
    private readonly jobs: JobRunService,
    private readonly dreams: DreamsService,
    private readonly calibrationRefit: CalibrationRefitService,
    private readonly changefeed: ChangefeedConsumerService,
    private readonly scheduler: SchedulerRegistry,
    private readonly surreal: SurrealService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  @Get('jobs')
  @RequireScopes('brain:admin')
  async listJobs(
    @Query('jobType') jobType?: string,
    @Query('status') status?: string,
    @Query('since') since?: string,
    @Query('companyId') companyId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const rows = await this.jobs.list({
      jobType: (jobType?.trim() as JobType) || undefined,
      status: (status?.trim() as JobStatus) || undefined,
      since: since?.trim() || undefined,
      companyId: companyId?.trim() || undefined,
      limit:
        parsedLimit !== undefined && Number.isFinite(parsedLimit)
          ? parsedLimit
          : undefined,
    });
    return { jobs: rows };
  }

  @Get('jobs/:runId')
  @RequireScopes('brain:admin')
  async getJob(
    @Req() req: AuthenticatedRequest,
    @Param('runId') runId: string,
  ) {
    // Try caller's company first; admins may also query across tenants
    // via the explicit companyId query string on /jobs list endpoint.
    const row = await this.jobs.get(runId, req.brainAuth.companyId);
    if (!row) throw new NotFoundException(`Job ${runId} not found`);
    return row;
  }

  @Post('jobs/:runId/cancel')
  @RequireScopes('brain:admin')
  async cancelJob(
    @Req() req: AuthenticatedRequest,
    @Param('runId') runId: string,
  ) {
    const ok = await this.jobs.requestCancel(runId, req.brainAuth.companyId);
    return { cancelRequested: ok };
  }

  /**
   * SSE stream of job_run transitions (start, progress update, finish).
   * Scoped to caller's tenant. Useful for live progress bars on the
   * /admin/jobs page without polling.
   */
  @Sse('jobs/stream')
  @RequireScopes('brain:admin')
  streamJobs(@Req() req: AuthenticatedRequest): Observable<{ data: unknown }> {
    const tenant = req.brainAuth.companyId;
    return this.jobs.observe().pipe(
      filter((j) => !tenant || j.companyId === tenant),
      map((j) => ({ data: j })),
    );
  }

  /**
   * List @Cron / @Interval / @Timeout entries registered on the Nest
   * scheduler at boot. last-run / next-run come from CronJob.lastDate /
   * nextDate so we don't need a separate persistence layer.
   */
  @Get('scheduler')
  @RequireScopes('brain:admin')
  scheduler_(): {
    cron: Array<{
      name: string;
      cronTime: string;
      lastFireAt: string | null;
      nextFireAt: string | null;
      running: boolean;
    }>;
    intervals: string[];
    timeouts: string[];
  } {
    const cronEntries: Array<{
      name: string;
      cronTime: string;
      lastFireAt: string | null;
      nextFireAt: string | null;
      running: boolean;
    }> = [];
    try {
      const all = this.scheduler.getCronJobs();
      for (const [name, job] of all.entries()) {
        // CronJob from `cron` package — runtime shape; loosely typed.
        const j = job as unknown as {
          cronTime?: { source?: string };
          lastDate?: () => Date | null;
          nextDate?: () => unknown;
          running?: boolean;
        };
        const lastDate = (() => {
          try {
            const d = j.lastDate?.();
            return d ? new Date(d).toISOString() : null;
          } catch {
            return null;
          }
        })();
        const nextDate = (() => {
          try {
            const n = j.nextDate?.() as { toJSDate?: () => Date } | Date | null;
            if (!n) return null;
            const d =
              n instanceof Date
                ? n
                : typeof (n as { toJSDate?: () => Date }).toJSDate ===
                    'function'
                  ? (n as { toJSDate: () => Date }).toJSDate()
                  : null;
            return d ? d.toISOString() : null;
          } catch {
            return null;
          }
        })();
        cronEntries.push({
          name,
          cronTime: j.cronTime?.source ?? '',
          lastFireAt: lastDate,
          nextFireAt: nextDate,
          running: j.running === true,
        });
      }
    } catch {
      // SchedulerRegistry is best-effort; empty list on failure.
    }
    return {
      cron: cronEntries,
      intervals: [...this.scheduler.getIntervals()],
      timeouts: [...this.scheduler.getTimeouts()],
    };
  }

  // ── Manual triggers ──────────────────────────────────────────────

  @Post('maintenance/dreams/run')
  @RequireScopes('brain:admin')
  async triggerDreams(
    @Req() req: AuthenticatedRequest,
    @Body() body: { operations?: ('dedup' | 'resolve' | 'summarize')[] } = {},
  ) {
    // We delegate to runForTenant directly so the JobRun row gets
    // triggeredBy='manual' + actor metadata.
    return this.dreams.runForTenant(
      req.brainAuth.companyId,
      body.operations ?? ['dedup', 'resolve'],
      {
        triggeredBy: 'manual',
        triggeredByActor: req.brainAuth.companyId,
      },
    );
  }

  @Post('maintenance/calibration-refit')
  @RequireScopes('brain:admin')
  async triggerCalibrationRefit(@Req() req: AuthenticatedRequest) {
    const calibrated = await this.calibrationRefit.refitCalibration({
      triggeredBy: 'manual',
      triggeredByActor: req.brainAuth.companyId,
    });
    const sourceTrust = await this.calibrationRefit.refitSourceTrust({
      triggeredBy: 'manual',
      triggeredByActor: req.brainAuth.companyId,
    });
    return { calibrationVersions: calibrated, sourceTrustUpserts: sourceTrust };
  }

  /**
   * Per-run emit drill for Dreams. Returns the emit rows the
   * specified run produced (identity_link / resolution / summary).
   * If no runId is given, returns the most recent successful run's
   * emits across known tenants.
   */
  @Get('dreams/runs/:runId/emits')
  @RequireScopes('brain:admin')
  async dreamEmits(
    @Param('runId') runId: string,
    @Query('companyId') companyIdQ?: string,
  ): Promise<{ runId: string; emits: Array<Record<string, unknown>> }> {
    const tenants = companyIdQ
      ? [companyIdQ]
      : this.apiKeys.knownCompanyIds();
    const emits: Array<Record<string, unknown>> = [];
    for (const companyId of tenants) {
      try {
        const rows = await this.surreal.withCompany(companyId, async (db) => {
          const res = (await db.query<any[]>(
            `SELECT runId, kind, ts, subject, object, detail
               FROM dream_emit WHERE runId = $runId ORDER BY ts ASC`,
            { runId },
          )) as any[];
          return (res[0] ?? []) as any[];
        });
        for (const r of rows) {
          emits.push({
            runId: r.runId,
            kind: r.kind,
            ts: typeof r.ts === 'string' ? r.ts : new Date(r.ts).toISOString(),
            subject: r.subject ?? null,
            object: r.object ?? null,
            detail: r.detail ?? null,
            companyId,
          });
        }
      } catch {
        // tenant without the emit table or no match — skip silently
      }
    }
    return { runId, emits };
  }

  /**
   * Top-level Dreams summary: recent run list (filtered to jobType
   * 'dreams') + aggregate counters across the last 30 days. Cheap;
   * meant for the dedicated /admin/dreams page.
   */
  @Get('dreams/summary')
  @RequireScopes('brain:admin')
  async dreamsSummary() {
    const runs = await this.jobs.list({
      jobType: 'dreams',
      limit: 100,
    });
    let identityLinks = 0;
    let resolutions = 0;
    let totalRuns = 0;
    let failed = 0;
    const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    for (const r of runs) {
      if (r.startedAt < since) continue;
      totalRuns += 1;
      if (r.status === 'failed') failed += 1;
      const res = r.result as Record<string, number> | null;
      identityLinks += Number(res?.identityLinksCreated ?? 0);
      resolutions += Number(res?.resolutionsApplied ?? 0);
    }
    return {
      runs,
      aggregates30d: {
        totalRuns,
        failed,
        identityLinksCreated: identityLinks,
        resolutionsApplied: resolutions,
      },
    };
  }

  @Get('changefeed/state')
  @RequireScopes('brain:admin')
  async changefeedState() {
    const [stats, cursors] = await Promise.all([
      this.changefeed.stats(),
      this.changefeed.cursorState(),
    ]);
    return { stats, cursors };
  }

  @Post('changefeed/drain')
  @RequireScopes('brain:admin')
  async drainChangefeed() {
    return this.changefeed.drainNow();
  }
}
