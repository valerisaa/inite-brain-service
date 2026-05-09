import type {
  AggregateMetric,
  EvalReport,
  ScenarioOutcome,
  Vertical,
  VerticalReport,
} from '../types';
import {
  recallAtK,
  meanReciprocalRank,
  extractionRecall,
  entityExtractionRate,
  identityResolutionRate,
  piiGatingCorrectness,
  memoryLifecycleCorrectness,
} from '../metrics';

/**
 * Aggregates per-scenario outcomes into per-vertical and overall metric
 * tables. Stateless — feed outcomes in, get the report back.
 */
export class Aggregator {
  build(outcomes: ScenarioOutcome[]): EvalReport {
    const byVertical = new Map<Vertical, ScenarioOutcome[]>();
    for (const o of outcomes) {
      const arr = byVertical.get(o.vertical) ?? [];
      arr.push(o);
      byVertical.set(o.vertical, arr);
    }

    const perVertical: VerticalReport[] = [];
    for (const [vertical, group] of byVertical) {
      perVertical.push({
        vertical,
        scenarios: group.length,
        metrics: this.computeMetrics(group),
      });
    }

    return {
      perVertical,
      overall: this.computeMetrics(outcomes),
      outcomes,
    };
  }

  private computeMetrics(group: ScenarioOutcome[]): AggregateMetric[] {
    const queries = group.flatMap((o) => o.queryResults);
    const extractions = group.flatMap((o) => o.extractionResults);
    const merges = group
      .map((o) => o.identityMergeResult)
      .filter((r): r is NonNullable<typeof r> => r !== undefined);
    const memAssertions = group.flatMap((o) => o.memoryAssertionResults);

    return [
      { name: 'recall@1', value: recallAtK(queries, 1), threshold: 0.6 },
      { name: 'recall@3', value: recallAtK(queries, 3), threshold: 0.8 },
      { name: 'MRR', value: meanReciprocalRank(queries), threshold: 0.5 },
      {
        name: 'extraction-predicate-recall',
        value: extractionRecall(extractions),
        threshold: 0.5,
      },
      {
        name: 'entity-extraction-rate',
        value: entityExtractionRate(extractions),
        threshold: 0.7,
      },
      { name: 'identity-resolution', value: identityResolutionRate(merges) },
      {
        name: 'pii-gating-correctness',
        value: piiGatingCorrectness(queries),
        threshold: 1.0,
      },
      // memory-lifecycle correctness covers update / supersede /
      // retract / forget. Threshold 1.0 — any lifecycle assertion
      // failing means brain's read-side disagrees with the write
      // semantics, which is non-negotiable. null when the slice has
      // no memory assertions (e.g. plain retrieval suites).
      {
        name: 'memory-lifecycle-correctness',
        value: memoryLifecycleCorrectness(memAssertions),
        threshold: 1.0,
      },
    ];
  }
}
