import { Controller, Get } from '@nestjs/common';
import { SurrealService } from '../db/surreal.service';

@Controller()
export class HealthController {
  constructor(private readonly surreal: SurrealService) {}

  @Get('health')
  async health() {
    const dbOk = await this.surreal.ping().catch(() => false);
    return {
      status: dbOk ? 'ok' : 'degraded',
      service: 'inite-brain-service',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      checks: {
        surrealdb: dbOk ? 'ok' : 'unreachable',
      },
    };
  }
}
