import { z } from 'zod'

/**
 * Wire contracts for write-side admin endpoints (POST / DELETE).
 *
 * **Duplicate** of src/contracts/admin/write-responses.schema.ts. See
 * admin-leases.ts for the rationale on duplication.
 */

// ── DELETE ───────────────────────────────────────────────────────

export const DropTenantResponseSchema = z.object({
  dropped: z.string(),
})

export const DlqDeleteResponseSchema = z.object({
  deleted: z.boolean(),
})

export const PredicateDeprecateResponseSchema = z.object({
  deprecated: z.string(),
})

// ── POST accepted envelopes ──────────────────────────────────────

export const JobCancelResponseSchema = z.object({
  cancelRequested: z.boolean(),
})

export const AcceptedDreamsResponseSchema = z.object({
  accepted: z.literal(true),
  jobType: z.literal('dreams'),
  companyId: z.string(),
})

export const AcceptedCompactionResponseSchema = z.object({
  accepted: z.literal(true),
  jobType: z.literal('compaction'),
  tenants: z.array(z.string()),
})

export const AcceptedCalibrationRefitResponseSchema = z.object({
  accepted: z.literal(true),
  jobs: z.array(z.string()),
})

export const AcceptedReindexResponseSchema = z.object({
  accepted: z.literal(true),
  runId: z.string(),
})

export const AcceptedScenariosBatchResponseSchema = z.object({
  accepted: z.literal(true),
  runId: z.string(),
  scenarioCount: z.number(),
})

export const ChangefeedDrainResponseSchema = z.object({
  consumed: z.record(z.string(), z.number()),
  pendingRemaining: z.number(),
  tenants: z.number(),
})

// ── POST mutations ───────────────────────────────────────────────

const PredicateDatatypeSchema = z.enum([
  'string',
  'number',
  'date',
  'datetime',
  'enum',
  'json',
])
const SemanticsSchema = z.enum([
  'append_only',
  'single_active',
  'bitemporal',
])
const PiiClassSchema = z.enum([
  'none',
  'identifier',
  'behavioral',
  'text',
  'sensitive',
])
const PredicateStatusSchema = z.enum([
  'active',
  'proposed',
  'aliased',
  'deprecated',
])
const PredicateCreatedBySchema = z.enum([
  'system',
  'admin',
  'llm_auto',
  'migration',
])

const PredicateDefinitionSchema = z.object({
  predicateId: z.string(),
  displayLabel: z.string(),
  description: z.string(),
  datatype: PredicateDatatypeSchema,
  semantics: SemanticsSchema,
  decayHalfLifeDays: z.number().nullable(),
  piiClass: PiiClassSchema,
  requiresScope: z.string().optional(),
  parentPredicateId: z.string().optional(),
  subjectClasses: z.array(z.string()).optional(),
  allowedValues: z.array(z.string()).optional(),
  status: PredicateStatusSchema,
  aliasedTo: z.string().optional(),
  createdBy: PredicateCreatedBySchema,
})

export const PredicateMutationResponseSchema = z.object({
  predicate: PredicateDefinitionSchema,
})

// ── POST complex ─────────────────────────────────────────────────

const DedupIdentityLinkSchema = z.object({
  survivorId: z.string(),
  loserId: z.string(),
  cosine: z.number(),
})

const DedupResultSchema = z.object({
  suspectsEvaluated: z.number(),
  llmJudgements: z.number(),
  identityLinksCreated: z.number(),
  unsurePairs: z.number(),
  identityLinks: z.array(DedupIdentityLinkSchema),
})

const ResolverResolutionSchema = z.object({
  winnerFactId: z.string(),
  loserFactId: z.string(),
  predicate: z.string(),
  entityId: z.string(),
  winnerObject: z.string(),
  loserObject: z.string(),
})

const ResolverResultSchema = z.object({
  pairsConsidered: z.number(),
  llmJudgements: z.number(),
  resolutionsApplied: z.number(),
  unsurePairs: z.number(),
  resolutions: z.array(ResolverResolutionSchema),
})

export const DreamsRunResponseSchema = z.object({
  companyId: z.string(),
  durationSeconds: z.number(),
  dedup: DedupResultSchema.optional(),
  resolve: ResolverResultSchema.optional(),
  summarized: z.boolean().optional(),
  error: z.string().optional(),
})

export const ReindexRunResponseSchema = z.object({
  tenantsScanned: z.number(),
  factsScanned: z.number(),
  factsUpdated: z.number(),
  durationMs: z.number(),
  dryRun: z.boolean(),
  provider: z.string(),
})

// ── Scenarios + baselines ────────────────────────────────────────

const OpenRecord = z.record(z.string(), z.unknown())

const ScenarioMetricsSchema = z.object({
  recallAt1: z.number(),
  recallAt5: z.number(),
  queries: z.number(),
  passes: z.number(),
  memoryAssertionsPassed: z.number(),
  memoryAssertionsTotal: z.number(),
  piiGatingPassed: z.number(),
  piiGatingTotal: z.number(),
})

const SetupSummarySchema = z.object({
  facts: z.number(),
  mentions: z.number(),
  links: z.number(),
  retracts: z.number(),
  forgets: z.number(),
  errors: z.array(
    z.object({
      step: z.number(),
      kind: z.string(),
      error: z.string(),
    }),
  ),
})

export const ScenarioRunOutcomeSchema = z.object({
  scenarioId: z.string(),
  vertical: z.string(),
  companyId: z.string(),
  startedAt: z.string(),
  durationMs: z.number(),
  passed: z.boolean(),
  setupSummary: SetupSummarySchema,
  queryResults: z.array(OpenRecord),
  memoryAssertionResults: z.array(OpenRecord),
  identityMergeResult: OpenRecord.optional(),
  synthesizeSkipped: z
    .object({ count: z.number(), reason: z.string() })
    .optional(),
  metrics: ScenarioMetricsSchema,
})

export const ScenariosBatchResponseSchema = z.object({
  outcomes: z.array(ScenarioRunOutcomeSchema),
})

const BaselineDiffMetricSchema = z.object({
  scenarioId: z.string(),
  metric: z.enum(['recallAt1', 'recallAt5']),
  baseline: z.number(),
  current: z.number(),
  delta: z.number(),
  verdict: z.enum(['regression', 'improved', 'stable']),
})

export const BaselineSaveResponseSchema = z.object({
  name: z.string(),
  savedAt: z.string(),
  scenarios: z.number(),
  meanRecallAt1: z.number(),
})

export const BaselineDiffResponseSchema = z.object({
  baseline: z.string(),
  entries: z.array(BaselineDiffMetricSchema),
})
