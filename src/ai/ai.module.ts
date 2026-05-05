import { Global, Module } from '@nestjs/common';
import { EmbedderService } from './embedder.service';

@Global()
@Module({
  providers: [EmbedderService],
  exports: [EmbedderService],
})
export class AiModule {}
