import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard, RequireScopes } from '../auth/api-key.guard';
import { AuthenticatedRequest } from '../auth/api-key.types';
import { AdminService } from './admin.service';
import { DreamsService } from '../dreams/dreams.service';
import { RunDreamsDto } from '../dreams/dto/run-dreams.dto';
import {
  ScenarioRunnerService,
  ScenarioRunOutcome,
} from './scenario-runner.service';
import { BaselineService } from './baseline.service';
import { TraceBufferService } from '../common/debug-trace';
import { SurrealService } from '../db/surreal.service';

@Controller('v1/admin')
@UseGuards(ApiKeyGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly dreams: DreamsService,
    private readonly scenarios: ScenarioRunnerService,
    private readonly baselines: BaselineService,
    private readonly traces: TraceBufferService,
    private readonly surreal: SurrealService,
  ) {}

  @Get('overview')
  @RequireScopes('brain:admin')
  async overview() {
    return this.admin.buildOverview();
  }

  @Post('dreams/run')
  @RequireScopes('brain:admin')
  async runDreams(
    @Req() req: AuthenticatedRequest,
    @Body() body: RunDreamsDto,
  ) {
    return this.dreams.runForTenant(
      req.brainAuth.companyId,
      body.operations ?? ['dedup', 'resolve'],
    );
  }

  // ── Scenarios ──────────────────────────────────────────────────────

  @Get('scenarios')
  @RequireScopes('brain:admin')
  listScenarios(@Query('vertical') vertical?: string) {
    const all = this.scenarios.list();
    return {
      scenarios: vertical ? all.filter((s) => s.vertical === vertical) : all,
    };
  }

  @Get('scenarios/:id')
  @RequireScopes('brain:admin')
  getScenario(@Param('id') id: string) {
    return this.scenarios.getById(id);
  }

  @Post('scenarios/:id/run')
  @RequireScopes('brain:admin')
  async runScenario(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { isolateTenant?: boolean; keepTenant?: boolean },
  ) {
    return this.scenarios.runOne(id, {
      isolateTenant: body?.isolateTenant !== false,
      keepTenant: body?.keepTenant === true,
      defaultCompanyId: req.brainAuth.companyId,
    });
  }

  @Post('scenarios/run-batch')
  @RequireScopes('brain:admin')
  async runBatch(
    @Req() req: AuthenticatedRequest,
    @Body() body: { ids?: string[]; vertical?: string; isolateTenant?: boolean },
  ) {
    const all = this.scenarios.list();
    const ids = body.ids?.length
      ? body.ids
      : body.vertical
        ? all.filter((s) => s.vertical === body.vertical).map((s) => s.id)
        : all.map((s) => s.id);
    const outcomes: ScenarioRunOutcome[] = [];
    for (const id of ids) {
      try {
        outcomes.push(
          await this.scenarios.runOne(id, {
            isolateTenant: body.isolateTenant !== false,
            defaultCompanyId: req.brainAuth.companyId,
          }),
        );
      } catch (e) {
        outcomes.push({
          scenarioId: id,
          vertical: 'cross',
          companyId: '-',
          startedAt: new Date().toISOString(),
          durationMs: 0,
          passed: false,
          setupSummary: {
            facts: 0,
            mentions: 0,
            links: 0,
            retracts: 0,
            forgets: 0,
            errors: [{ step: -1, kind: 'runtime', error: (e as Error).message }],
          },
          queryResults: [],
          metrics: { recallAt1: 0, recallAt5: 0, queries: 0, passes: 0 },
        });
      }
    }
    return { outcomes };
  }

  // ── Baselines ──────────────────────────────────────────────────────

  @Get('baselines')
  @RequireScopes('brain:admin')
  listBaselines() {
    return this.baselines.list();
  }

  @Post('baselines/:name')
  @RequireScopes('brain:admin')
  async saveBaseline(
    @Param('name') name: string,
    @Body() body: { outcomes: ScenarioRunOutcome[] },
  ) {
    if (!body?.outcomes?.length) {
      throw new NotFoundException('outcomes required');
    }
    return this.baselines.save(name, body.outcomes);
  }

  @Post('baselines/:name/diff')
  @RequireScopes('brain:admin')
  async diffBaseline(
    @Param('name') name: string,
    @Body() body: { outcomes: ScenarioRunOutcome[] },
  ) {
    return this.baselines.diff(name, body?.outcomes ?? []);
  }

  // ── Traces ─────────────────────────────────────────────────────────

  @Get('traces')
  @RequireScopes('brain:admin')
  listTraces() {
    return { traces: this.traces.list() };
  }

  @Get('traces/:requestId')
  @RequireScopes('brain:admin')
  getTrace(@Param('requestId') requestId: string) {
    const t = this.traces.get(requestId);
    if (!t) throw new NotFoundException(`Trace ${requestId} not found`);
    return t;
  }

  // ── Tenants ────────────────────────────────────────────────────────

  @Delete('tenants/:companyId')
  @RequireScopes('brain:admin')
  async dropTenant(@Param('companyId') companyId: string) {
    if (!companyId.startsWith('eval_')) {
      throw new NotFoundException(
        `Only ephemeral eval tenants can be dropped via admin API (got: ${companyId})`,
      );
    }
    await this.surreal.dropCompanyDatabase(companyId);
    return { dropped: companyId };
  }
}
