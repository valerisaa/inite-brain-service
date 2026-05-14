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
  identityResolutionMetrics,
  piiGatingCorrectness,
  memoryLifecycleCorrectness,
  ndcgAtK,
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
    const miaResults = group.flatMap((o) => o.miaTestResults);

    // Temporal split: queries carrying an asOf are bitemporal /
    // historical-intent; the rest are current-state. A SOTA-claim
    // requires both partitions to be measured separately — a
    // 0.88 mean recall@1 can hide a 0.50 as-of-T slice if the
    // current slice is dominant.
    const temporalQueries = queries.filter((q) => q.temporal);
    const currentQueries = queries.filter((q) => !q.temporal);

    return [
      { name: 'recall@1', value: recallAtK(queries, 1), threshold: 0.6 },
      { name: 'recall@3', value: recallAtK(queries, 3), threshold: 0.8 },
      { name: 'MRR', value: meanReciprocalRank(queries), threshold: 0.5 },
      // NDCG@10 — canonical retrieval metric on BEIR/MTEB/MS MARCO.
      // Standard reporting unit for embedding-model papers; lets our
      // numbers be directly compared to published baselines.
      // No threshold here because the ground-truth distribution in
      // our scenarios is single-relevant — NDCG@10 mirrors recall@1
      // when k≥rank, so threshold pressure is already on recall@k.
      { name: 'NDCG@10', value: ndcgAtK(queries, 10) },
      // Temporal split. Reported alongside the aggregate so a
      // regression in either partition is loud. null when the
      // partition is empty (e.g. retrieval-only scenarios).
      {
        name: 'recall@1:temporal',
        value: recallAtK(temporalQueries, 1),
      },
      {
        name: 'recall@1:current',
        value: recallAtK(currentQueries, 1),
      },
      {
        name: 'MRR:temporal',
        value: meanReciprocalRank(temporalQueries),
      },
      {
        name: 'MRR:current',
        value: meanReciprocalRank(currentQueries),
      },
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
      // Identity-resolution: precision / recall / F1 over identity_of
      // intents. Recall = declared merges that succeeded; precision =
      // declared distractors NOT over-merged. The old single-rate
      // metric was blind to false merges (a placebo). Threshold is
      // attached to F1 only — precision/recall are reported alongside
      // for debuggability.
      ...identityMergeMetrics(merges),
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
      // privacy-leakage AUC — Membership Inference Attack score.
      // We report the MAX AUC across all MIA tests in the slice;
      // one leaking test fails the run regardless of how many other
      // tests passed. Inverted threshold (lower is better): pass
      // when AUC ≤ 0.6 across every test; we surface the worst
      // value so a regression can't hide behind an average.
      // null when no MIA tests in the slice.
      {
        name: 'privacy-leakage-mia-auc',
        value: maxMiaAuc(miaResults),
        // No `threshold` on the worst-AUC metric directly because
        // the comparator the harness uses is `value < threshold` for
        // pass — wrong direction for AUC. Per-test pass/fail is
        // captured inside MiaTestResult.passed; the harness asserts
        // those separately.
      },
    ];
  }
}

/** Maximum AUC across MIA tests, or null when there are none. */
function maxMiaAuc(results: import('../types').MiaTestResult[]): number | null {
  if (results.length === 0) return null;
  let max = 0;
  for (const r of results) if (r.auc > max) max = r.auc;
  return max;
}

/**
 * Identity-resolution metrics flattened to AggregateMetric rows. F1
 * carries the gating threshold; precision and recall ride alongside
 * with no threshold (so an F1 dip doesn't double-fire at the gate).
 */
function identityMergeMetrics(
  merges: import('../types').IdentityMergeResult[],
): AggregateMetric[] {
  const m = identityResolutionMetrics(merges);
  return [
    { name: 'identity-resolution-f1', value: m.f1, threshold: 0.8 },
    { name: 'identity-resolution-precision', value: m.precision },
    { name: 'identity-resolution-recall', value: m.recall },
  ];
}
