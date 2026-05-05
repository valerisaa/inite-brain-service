import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
  IsISO8601,
  Min,
  Max,
} from 'class-validator';

export class SearchDto {
  @IsString()
  query: string;

  @IsOptional() @IsNumber() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @IsArray() @IsString({ each: true })
  entityTypes?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  predicates?: string[];

  @IsOptional() @IsISO8601()
  asOf?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  minConfidence?: number;

  @IsOptional() @IsBoolean()
  includeContested?: boolean;

  @IsOptional() @IsBoolean()
  includeRetracted?: boolean;
}
