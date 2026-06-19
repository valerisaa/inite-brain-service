/**
 * P2 — golden snapshot for the BOOTSTRAP_GOLD_SET isotonic fit.
 *
 * The general isotonic.unit-spec.ts file covers properties (monotone,
 * pooled, clamped, identity); this file pins the EXACT fitted map for
 * the production bootstrap set so a future change to the gold set is
 * a visible diff in the snapshot rather than a silent recalibration.
 *
 * Update procedure: when the gold set is intentionally retuned, run
 * `pnpm test -u test/isotonic-golden.unit-spec.ts` to refresh the
 * snapshot in the same commit.
 */
import { fitIsotonic, applyMap } from '../src/ai/calibration/isotonic';
import { BOOTSTRAP_GOLD_SET } from '../src/ai/calibration/gold-set';

describe('BOOTSTRAP_GOLD_SET — golden isotonic fit', () => {
  const map = fitIsotonic(BOOTSTRAP_GOLD_SET);
  // Round to 4 decimal places so floating-point jitter inside PAV
  // doesn't churn the snapshot across architectures.
  const roundedValues = map.values.map((v) => Number(v.toFixed(4)));
  const roundedThresholds = map.thresholds.map((t) => Number(t.toFixed(4)));

  it('matches the snapshotted (thresholds, values, sampleCount) tuple', () => {
    expect({
      thresholds: roundedThresholds,
      values: roundedValues,
      sampleCount: map.sampleCount,
    }).toMatchSnapshot();
  });

  it('produces stable calibrated values at probe points', () => {
    const probes = [0.0, 0.05, 0.25, 0.5, 0.75, 0.85, 0.95, 1.0];
    const out = probes.map((p) => ({
      raw: p,
      calibrated: Number(applyMap(map, p).toFixed(4)),
    }));
    expect(out).toMatchSnapshot();
  });
});
