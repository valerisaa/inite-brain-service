import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard, RequireScopes } from '../auth/api-key.guard';
import { AuthenticatedRequest } from '../auth/api-key.types';
import { AdminService } from './admin.service';
import { DreamsService } from '../dreams/dreams.service';
import { RunDreamsDto } from '../dreams/dto/run-dreams.dto';

@Controller('v1/admin')
@UseGuards(ApiKeyGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly dreams: DreamsService,
  ) {}

  /**
   * Single hydrated dashboard payload. Fans out across all tenants
   * known to the ApiKey registry — admin-only, deliberately broader
   * than any per-tenant endpoint.
   */
  @Get('overview')
  @RequireScopes('brain:admin')
  async overview() {
    return this.admin.buildOverview();
  }

  /**
   * Convenience proxy so the admin UI can trigger dreams without
   * authenticating against a specific tenant key — the admin's own
   * token (companyId from JWT) is the tenant the run targets.
   */
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
}
