import type { QueryResult } from '../../../src/eval/types';

/**
 * PII-gating correctness — share of absence-style queries (caller lacks
 * brain:read_pii) where the expected entity was correctly NOT returned.
 */
export function piiGatingCorrectness(results: QueryResult[]): number {
  const piiQueries = results.filter((r) => r.piiGatedCorrectly !== null);
  if (piiQueries.length === 0) return 1; // vacuously correct when nothing to gate
  const ok = piiQueries.filter((r) => r.piiGatedCorrectly === true).length;
  return ok / piiQueries.length;
}
