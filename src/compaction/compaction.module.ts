import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CompactionService, SUMMARY_GENERATOR } from './compaction.service';
import { ConcatSummaryGenerator } from './summary-generator';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [ScheduleModule.forRoot(), MetricsModule],
  providers: [
    CompactionService,
    { provide: SUMMARY_GENERATOR, useClass: ConcatSummaryGenerator },
  ],
  exports: [CompactionService, SUMMARY_GENERATOR],
})
export class CompactionModule {}
