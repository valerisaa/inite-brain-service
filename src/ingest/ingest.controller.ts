import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard, RequireScopes } from '../auth/api-key.guard';
import { IngestService } from './ingest.service';
import { IngestFactDto } from './dto/ingest-fact.dto';
import { AuthenticatedRequest } from '../auth/api-key.types';

@Controller('v1/ingest')
@UseGuards(ApiKeyGuard)
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post('fact')
  @RequireScopes('brain:write')
  async ingestFact(
    @Req() req: AuthenticatedRequest,
    @Body() body: IngestFactDto,
  ) {
    return this.ingest.ingestFact(req.brainAuth.companyId, body);
  }
}
