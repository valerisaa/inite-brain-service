import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DreamsModule } from '../dreams/dreams.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * `/v1/admin/*` — operator-only surfaces. All routes require
 * `brain:admin` scope. Read-only in v1 except `dreams/run` which
 * proxies the existing DreamsService.
 *
 * Lives outside the per-tenant request flow: handlers receive the
 * caller's companyId (from JWT/ApiKey) but most queries fan out over
 * `ApiKeyService.knownCompanyIds()` to give a cross-tenant view —
 * that's the whole point of an admin panel.
 */
@Module({
  imports: [AuthModule, DreamsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
