import type { Scenario, EvalReport } from '../../../src/eval/types';
import { ScenarioRunner } from './scenario-runner';
import { Aggregator } from './aggregator';

/**
 * Orchestrates a full eval pass: iterate scenarios, run each, aggregate.
 * Two collaborators, two responsibilities — runner produces outcomes,
 * aggregator turns them into a report.
 */
export class EvalRunner {
  constructor(
    private readonly scenarioRunner: ScenarioRunner,
    private readonly aggregator: Aggregator,
  ) {}

  async run(scenarios: Scenario[]): Promise<EvalReport> {
    const outcomes = [];
    for (const s of scenarios) {
      outcomes.push(await this.scenarioRunner.run(s));
    }
    return this.aggregator.build(outcomes);
  }
}
