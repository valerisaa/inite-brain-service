import type { EvalReport, AggregateMetric } from '../types';

/**
 * Stable, machine-readable shape used for baseline-diff. Kept narrow on
 * purpose — only the fields the delta-gate compares — so adding a new
 * AggregateMetric field doesn't churn baselines unnecessarily. Schema
 * version lets the diff script reject unknown shapes loudly instead of
 * silently treating them as a regression.
 */
export interface SerializedReport {
  schemaVersion: 1;
  generatedAt: string;
  perVertical: Array<{
    vertical: string;
    scenarios: number;
    metrics: Array<{ name: string; value: number | null; threshold?: number }>;
  }>;
  overall: Array<{ name: string; value: number | null; threshold?: number }>;
}

/**
 * Renders an EvalReport as a human-readable markdown summary.
 * Pure formatting — no IO, no side-effects.
 */
export class Reporter {
  /**
   * Stable JSON shape for baseline-diff and downstream tooling. The
   * markdown render() is for humans; this is for machines. Only the
   * fields the delta-gate compares are emitted.
   */
  serialize(report: EvalReport): SerializedReport {
    const stripMetric = (m: AggregateMetric) => ({
      name: m.name,
      value: m.value,
      ...(m.threshold !== undefined ? { threshold: m.threshold } : {}),
    });
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      perVertical: report.perVertical.map((v) => ({
        vertical: v.vertical,
        scenarios: v.scenarios,
        metrics: v.metrics.map(stripMetric),
      })),
      overall: report.overall.map(stripMetric),
    };
  }

  render(report: EvalReport): string {
    const lines: string[] = [];
    lines.push('## Brain Quality Eval', '');

    lines.push('### Per-vertical', '');
    lines.push(this.headerRow(report.overall));
    lines.push(this.separatorRow(report.overall.length));
    for (const v of report.perVertical) {
      lines.push(this.metricRow(`${v.vertical} (${v.scenarios})`, v.metrics));
    }
    lines.push(this.metricRow('**overall**', report.overall));
    lines.push('');

    lines.push('### Per-query rank diagnostics', '');
    lines.push('| scenario | query | rank | top | predicate-match |');
    lines.push('|---|---|---|---|---|');
    for (const o of report.outcomes) {
      for (const q of o.queryResults) {
        const rank = q.rankOfExpected === 0 ? 'miss' : `#${q.rankOfExpected}`;
        const pm =
          q.factPredicateMatched === null
            ? '—'
            : q.factPredicateMatched
              ? '✓'
              : '✗';
        lines.push(
          `| ${o.scenarioId} | ${this.shorten(q.query)} | ${rank} | ${this.shorten(
            q.topEntityRef ?? '—',
          )} | ${pm} |`,
        );
      }
    }

    // Memory-lifecycle: only show assertions that FAILED — passing ones
    // are uninteresting noise on a clean run, but a failure should be
    // loud enough that the operator can grep it from CI logs.
    const failedAssertions = report.outcomes.flatMap((o) =>
      o.memoryAssertionResults.filter((a) => !a.passed),
    );
    if (failedAssertions.length > 0) {
      lines.push('', '### Memory-lifecycle FAILURES', '');
      lines.push('| scenario | kind | description | detail |');
      lines.push('|---|---|---|---|');
      for (const a of failedAssertions) {
        lines.push(
          `| ${a.scenarioId} | ${a.kind} | ${this.shorten(a.description)} | ${this.shorten(a.detail ?? '')} |`,
        );
      }
    }

    // MIA / privacy leakage — show ALL tests run, not just failures,
    // because the AUC value itself is informative even on a pass.
    // Operators want to see "how close are we to the regulatory line"
    // not just "did we cross it".
    const miaTests = report.outcomes.flatMap((o) => o.miaTestResults);
    if (miaTests.length > 0) {
      lines.push('', '### Privacy leakage (MIA AUC)', '');
      lines.push('| scenario | description | AUC | threshold | pass |');
      lines.push('|---|---|---|---|---|');
      for (const m of miaTests) {
        lines.push(
          `| ${m.scenarioId} | ${this.shorten(m.description)} | ${m.auc.toFixed(3)} | ${m.threshold.toFixed(2)} | ${m.passed ? '✓' : '✗'} |`,
        );
      }
    }

    return lines.join('\n');
  }

  private headerRow(metrics: AggregateMetric[]): string {
    return '| vertical | ' + metrics.map((m) => m.name).join(' | ') + ' |';
  }

  private separatorRow(count: number): string {
    return '|' + '---|'.repeat(count + 1);
  }

  private metricRow(label: string, metrics: AggregateMetric[]): string {
    const cells = metrics.map((m) => {
      if (m.value === null) return '—';
      const formatted = m.value.toFixed(2);
      if (m.threshold === undefined) return formatted;
      const ok = m.value >= m.threshold ? '✓' : '✗';
      return `${formatted} ${ok}`;
    });
    return `| ${label} | ${cells.join(' | ')} |`;
  }

  private shorten(s: string): string {
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  }
}
