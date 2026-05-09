import type { Scenario, ScenarioOutcome } from '../types';
import { SetupApplier } from './setup-applier';
import { QueryExecutor } from './query-executor';
import { MemoryAssertionsChecker } from './memory-assertions';

/**
 * Runs ONE scenario end-to-end: setup → memory-assertions → queries → outcome.
 * Pure orchestration over the single-purpose collaborators.
 *
 * The memory-assertions stage runs BEFORE queries so a forget-then-search
 * scenario can assert the entity's full disappearance even on queries
 * that target a forgotten predicate. The query stage stays unchanged
 * — it tests retrieval ranking, not lifecycle correctness.
 */
export class ScenarioRunner {
  constructor(
    private readonly setupApplier: SetupApplier,
    private readonly queryExecutor: QueryExecutor,
    private readonly memoryChecker?: MemoryAssertionsChecker,
  ) {}

  async run(scenario: Scenario): Promise<ScenarioOutcome> {
    const { extractions, identityMerge } = await this.setupApplier.apply(scenario);

    const memoryAssertionResults = this.memoryChecker
      ? await this.memoryChecker.check(scenario)
      : [];

    const queryResults = [];
    for (const q of scenario.queries) {
      queryResults.push(await this.queryExecutor.execute(q));
    }

    return {
      scenarioId: scenario.id,
      vertical: scenario.vertical,
      queryResults,
      extractionResults: extractions,
      identityMergeResult: identityMerge,
      memoryAssertionResults,
    };
  }
}
