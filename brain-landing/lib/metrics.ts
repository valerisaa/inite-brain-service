/**
 * Brain quality metrics — single source of truth for the Stats block.
 *
 * Numbers are copied verbatim from the latest eval report
 * (`inite-brain-service/.eval-current/report.json`, generated
 * 2026-06-19, n=262) — the multi-vertical scenario suite plus the
 * wikidata directory. Bootstrap 95% CIs on the retrieval legs. The
 * `floor` is the CI gate threshold; a run under it fails the build.
 */

export interface Metric {
  label: string
  /** Display string (kept as text for layout stability). */
  value: string
  /** Bootstrap 95% CI on the retrieval legs. */
  ci?: string
  /** CI gate threshold. */
  floor: string
  hint: string
}

/** Retrieval-quality headline metrics. */
export const METRICS: Metric[] = [
  {
    label: 'recall@1',
    value: '0.962',
    ci: '0.94–0.98',
    floor: '≥ 0.6',
    hint: 'Top-1 retrieval correctness across the full suite (n=262).',
  },
  {
    label: 'recall@3',
    value: '0.989',
    ci: '0.97–1.00',
    floor: '≥ 0.8',
    hint: 'Correct fact within the top 3 (n=262).',
  },
  {
    label: 'MRR',
    value: '0.976',
    ci: '0.96–0.99',
    floor: '≥ 0.5',
    hint: 'Mean reciprocal rank of the first relevant fact (n=262).',
  },
  {
    label: 'NDCG@10',
    value: '0.973',
    ci: '0.96–0.99',
    floor: '≥ 0.7',
    hint: 'Ranking quality across the top-10 window (n=262).',
  },
]

/** recall@1 split by vertical — the per-vertical breakdown. */
export interface VerticalRecall {
  vertical: string
  value: number
  n: number
}

export const PER_VERTICAL: VerticalRecall[] = [
  { vertical: 'cross', value: 0.99, n: 192 },
  { vertical: 'rent', value: 0.939, n: 33 },
  { vertical: 'shop', value: 0.833, n: 12 },
  { vertical: 'estate', value: 0.8, n: 10 },
  { vertical: 'events', value: 0.778, n: 9 },
  { vertical: 'health', value: 1.0, n: 6 },
]

/** Correctness legs — every one gated at 1.0. */
export const CORRECTNESS: { label: string; value: string }[] = [
  { label: 'faithfulness', value: '1.000' },
  { label: 'identity-F1', value: '1.000' },
  { label: 'memory-lifecycle', value: '1.000' },
  { label: 'PII-gating', value: '1.000' },
]
