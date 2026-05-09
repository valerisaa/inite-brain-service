/**
 * Membership Inference Attack — AUC over two score distributions.
 *
 * Privacy-leakage check (MUSE convention adapted to our search-side).
 * After GDPR-forgetting an entity, can an attacker tell whether the
 * entity was once in the system? We probe by running the forgotten
 * entity's name as a search query — if the top-hit score is high,
 * brain is leaking through a residual cluster mate (mentioned_with
 * edge that survived, neighbour fact that mentions the name, etc.).
 *
 * Methodology:
 *   - positives = top-hit scores for forgotten-entity name queries
 *   - negatives = top-hit scores for control names that were NEVER
 *     in the dataset (random from a name pool)
 *   - AUC = P(score(positive) > score(negative))
 *     ↑ close to 0.5 → no leakage (forgotten and control look the same)
 *     ↑ close to 1.0 → full leakage (forgotten still findable)
 *
 * Mann-Whitney U / ROC-equivalent computation. Robust to score-scale
 * differences across runs because the metric is rank-based.
 *
 * Threshold convention (MUSE-aligned):
 *   - AUC ≤ 0.6  ⇒ pass (regulatory-defensible "model has forgotten")
 *   - AUC ≤ 0.55 ⇒ ideal (statistically indistinguishable)
 *   - AUC > 0.6  ⇒ leak (legal finding)
 *
 * `miaAuc` is pure — pass distributions in, AUC out. The harness
 * (mia-checker.ts) handles the search round-trip.
 */
export function miaAuc(positives: number[], negatives: number[]): number {
  if (positives.length === 0 || negatives.length === 0) return 0.5;
  let wins = 0;
  for (const p of positives) {
    for (const n of negatives) {
      if (p > n) wins += 1;
      else if (p === n) wins += 0.5;
    }
  }
  return wins / (positives.length * negatives.length);
}
