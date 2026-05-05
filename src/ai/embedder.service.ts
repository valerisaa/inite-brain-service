import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class EmbedderService {
  private readonly logger = new Logger(EmbedderService.name);
  private openai: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
    });
    this.model = this.configService.get<string>(
      'OPENAI_EMBEDDING_MODEL',
      'text-embedding-3-small',
    );
    this.dimensions = parseInt(
      this.configService.get<string>('OPENAI_EMBEDDING_DIMENSIONS', '1536'),
      10,
    );
  }

  async embed(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) return new Array(this.dimensions).fill(0);

    const res = await this.openai.embeddings.create({
      model: this.model,
      input: trimmed,
      dimensions: this.dimensions,
    });
    return res.data[0].embedding;
  }

  getDimensions(): number {
    return this.dimensions;
  }
}
