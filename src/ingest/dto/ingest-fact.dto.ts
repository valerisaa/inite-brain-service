import {
  IsString,
  IsOptional,
  IsObject,
  IsNumber,
  IsISO8601,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EntityRefByVerticalDto {
  @IsString()
  vertical: string;

  @IsString()
  id: string;
}

export class EntityRefByIdDto {
  @IsString()
  entityId: string;
}

export class FactSourceDto {
  @IsString()
  vertical: string;

  @IsOptional() @IsString() eventId?: string;
  @IsOptional() @IsString() conversationId?: string;
  @IsOptional() @IsString() messageId?: string;
  @IsOptional() @IsString() recorder?: string;
}

export class IngestFactDto {
  @ValidateNested()
  @Type(() => Object)
  entityRef: EntityRefByVerticalDto | EntityRefByIdDto;

  @IsString()
  predicate: string;

  // String for simple, allow object via class-transformer for richer payloads.
  // Stored as JSON string in SurrealDB to keep schema uniform.
  @IsString()
  object: string;

  @IsISO8601()
  validFrom: string;

  @IsOptional() @IsISO8601() validUntil?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  confidence?: number;

  @ValidateNested()
  @Type(() => FactSourceDto)
  source: FactSourceDto;

  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}
