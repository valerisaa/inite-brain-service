import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DebugTraceInterceptor, TraceBufferService } from './debug-trace';
import { ActivityTrackerService } from './activity-tracker.service';
import { InFlightInterceptor } from './in-flight.interceptor';

@Global()
@Module({
  providers: [
    TraceBufferService,
    { provide: APP_INTERCEPTOR, useClass: DebugTraceInterceptor },
    ActivityTrackerService,
    { provide: APP_INTERCEPTOR, useClass: InFlightInterceptor },
  ],
  exports: [TraceBufferService, ActivityTrackerService],
})
export class CommonModule {}
