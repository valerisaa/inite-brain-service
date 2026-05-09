import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { SynthesizeController } from './synthesize.controller';
import { SynthesizeService } from './synthesize.service';

@Module({
  imports: [SearchModule],
  controllers: [SynthesizeController],
  providers: [SynthesizeService],
  exports: [SynthesizeService],
})
export class SynthesizeModule {}
