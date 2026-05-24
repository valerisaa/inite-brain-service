import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DebugTraceInterceptor, TraceBufferService } from './debug-trace';

@Global()
@Module({
  providers: [
    TraceBufferService,
    { provide: APP_INTERCEPTOR, useClass: DebugTraceInterceptor },
  ],
  exports: [TraceBufferService],
})
export class CommonModule {}
