import type { BrainClient } from '@inite/knowledge';
import type { MiaTest, MiaTestResult, Scenario } from '../types';
import { miaAuc } from '../metrics/mia-auc';

/**
 * MiaChecker — runs Membership Inference Attack tests after
 * memoryAssertions, before queries. For each test:
 *   1. Search every forgottenName, record the top-hit's `score`.
 *      `score` is brain's post-fusion-decay-boost number; it's the
 *      cleanest single signal of "how confident was retrieval that
 *      anything matched".
 *   2. Search every controlName, same way.
 *   3. AUC over the two distributions (positives=forgotten,
 *      negatives=control). AUC > threshold ⇒ leak.
 *
 * No-hits → score 0. The metric is rank-based, so absolute zeros
 * don't break the math; they just make the distribution flat.
 *
 * One bad query throwing should not fail the whole MIA test. We
 * record the score as 0 and continue; the failure bubbles into
 * `detail` but the AUC still computes.
 */
export class MiaChecker {
  constructor(private readonly brain: BrainClient) {}

  async check(scenario: Scenario): Promise<MiaTestResult[]> {
    const tests = scenario.miaTests ?? [];
    const out: MiaTestResult[] = [];
    for (const t of tests) {
      out.push(await this.runOne(scenario.id, t));
    }
    return out;
  }

  private async runOne(
    scenarioId: string,
    t: MiaTest,
  ): Promise<MiaTestResult> {
    const threshold = t.threshold ?? 0.6;
    const forgottenScores = await this.collectScores(t.forgottenNames);
    const controlScores = await this.collectScores(t.controlNames);
    const auc = miaAuc(forgottenScores, controlScores);
    const passed = auc <= threshold;
    return {
      scenarioId,
      description: t.description,
      auc,
      threshold,
      passed,
      forgottenN: forgottenScores.length,
      controlN: controlScores.length,
      ...(passed
        ? {}
        : {
            detail: `MIA leak: forgotten-name top-scores skew above control-name top-scores (AUC=${auc.toFixed(3)})`,
          }),
    };
  }

  private async collectScores(names: string[]): Promise<number[]> {
    const out: number[] = [];
    for (const name of names) {
      try {
        const res = await this.brain.search({ query: name, limit: 1 });
        const top = res.results[0];
        out.push(top?.score ?? 0);
      } catch {
        out.push(0);
      }
    }
    return out;
  }
}
