import { miaAuc } from './eval/metrics/mia-auc';

describe('miaAuc', () => {
  it('returns 0.5 on empty positives or negatives', () => {
    expect(miaAuc([], [0.1, 0.2])).toBe(0.5);
    expect(miaAuc([0.5], [])).toBe(0.5);
    expect(miaAuc([], [])).toBe(0.5);
  });

  it('AUC = 1.0 when every positive > every negative (full leak)', () => {
    expect(miaAuc([0.9, 0.8, 0.7], [0.1, 0.2])).toBe(1.0);
  });

  it('AUC = 0.0 when every negative > every positive (paradoxical anti-leak)', () => {
    expect(miaAuc([0.1, 0.2], [0.9, 0.8])).toBe(0.0);
  });

  it('AUC = 0.5 on identical distributions (no leak signal)', () => {
    expect(miaAuc([0.5, 0.5, 0.5], [0.5, 0.5, 0.5])).toBe(0.5);
  });

  it('ties contribute 0.5 each (Mann-Whitney U convention)', () => {
    // 1 positive (0.5), 1 negative (0.5): wins=0.5, total=1, AUC=0.5
    expect(miaAuc([0.5], [0.5])).toBe(0.5);
  });

  it('mixed distribution lands between 0.5 and 1', () => {
    // positives [0.7, 0.6], negatives [0.4, 0.5]:
    //   wins = 4 (every pos beats every neg) → AUC = 1.0
    expect(miaAuc([0.7, 0.6], [0.4, 0.5])).toBe(1.0);
    // positives [0.5, 0.5], negatives [0.4, 0.6]:
    //   pos[0]=0.5: beats 0.4 (1), tie with 0.6? no, 0.5<0.6 → 0
    //     But 0.4: 0.5>0.4 → 1. Sum=1.
    //   pos[1]=0.5: same. Sum=1.
    //   total wins=2, pairs=4 → AUC=0.5
    expect(miaAuc([0.5, 0.5], [0.4, 0.6])).toBe(0.5);
  });

  it('boundary 0.6 is the regulatory pass/fail line', () => {
    // Construct a 3v2 split that lands JUST above 0.6:
    //   positives [0.6, 0.5, 0.5], negatives [0.4, 0.55]:
    //   0.6 vs 0.4 (win), 0.6 vs 0.55 (win)             → 2
    //   0.5 vs 0.4 (win), 0.5 vs 0.55 (loss)            → 1
    //   0.5 vs 0.4 (win), 0.5 vs 0.55 (loss)            → 1
    //   total = 4, pairs=6 → AUC = 4/6 ≈ 0.667 → fails 0.6
    expect(miaAuc([0.6, 0.5, 0.5], [0.4, 0.55])).toBeCloseTo(4 / 6, 6);
  });
});
