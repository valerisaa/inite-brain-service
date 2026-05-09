import { IsIn, IsOptional, IsString } from 'class-validator';
import { SearchDto } from '../../search/dto/search.dto';

export type SynthesisGuardrails = 'strict' | 'lenient' | 'off';

/**
 * SynthesizeDto extends SearchDto so all retrieval levers
 * (predicates, asOf, minConfidence, searchMode, tokenBudget, ...)
 * are available on the synthesize endpoint without re-declaration.
 * The added fields are synthesis-only.
 */
export class SynthesizeDto extends SearchDto {
  /**
   * Override the chat model used for the synthesis + verifier calls.
   * Defaults to OPENAI_CHAT_MODEL.
   */
  @IsOptional()
  @IsString()
  synthesisModel?: string;

  /**
   * Guardrail mode (corrective-RAG style):
   *   strict   — verifier-LLM judges every claim in the answer for
   *              support against the retrieved facts. Unsupported →
   *              `answer: null`, `reason: 'verifier_failed'`. Default.
   *   lenient  — verifier still runs, but the answer is returned even
   *              on partial / unsupported verdicts; `reason` carries
   *              the verifier's verdict for the caller to decide.
   *   off      — skip verifier altogether (cheapest; for callers that
   *              do their own grounding downstream).
   */
  @IsOptional()
  @IsIn(['strict', 'lenient', 'off'])
  synthesisGuardrails?: SynthesisGuardrails;
}
