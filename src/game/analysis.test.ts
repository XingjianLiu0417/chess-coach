import { describe, expect, it } from 'vitest';
import { accuracyOf, classify, cpLossFor, evalDisplay, winProbWhite } from './analysis';

describe('classify 走子分类', () => {
  it('中局阈值:接近最佳 → best', () => {
    expect(classify(0, 'middlegame')).toBe('best');
    expect(classify(0.14, 'middlegame')).toBe('best');
  });
  it('中局:0.15~0.8 好棋,0.8~1.5 不准确', () => {
    expect(classify(0.2, 'middlegame')).toBe('good');
    expect(classify(0.79, 'middlegame')).toBe('good');
    expect(classify(0.8, 'middlegame')).toBe('inaccuracy');
    expect(classify(1.49, 'middlegame')).toBe('inaccuracy');
  });
  it('中局:1.6~2.8 失误,>2.8 大漏招', () => {
    expect(classify(1.5, 'middlegame')).toBe('inaccuracy');
    expect(classify(1.6, 'middlegame')).toBe('mistake');
    expect(classify(2.8, 'middlegame')).toBe('mistake');
    expect(classify(2.81, 'middlegame')).toBe('blunder');
    expect(classify(9, 'middlegame')).toBe('blunder');
  });
  it('开局阈值校准:0.6 兵损失(合理着法的常见浮动)→ 好棋;真亏 1 兵才 ?!', () => {
    expect(classify(0.6, 'opening')).toBe('good');
    expect(classify(0.99, 'opening')).toBe('good');
    expect(classify(1.0, 'opening')).toBe('inaccuracy');
    expect(classify(1.5, 'opening')).toBe('inaccuracy');
    expect(classify(2.0, 'opening')).toBe('mistake');
    expect(classify(2.9, 'opening')).toBe('mistake');
    expect(classify(3.01, 'opening')).toBe('blunder');
  });
  it('残局阈值严格:0.6 兵已算不准确', () => {
    expect(classify(0.6, 'endgame')).toBe('inaccuracy');
    expect(classify(1.6, 'endgame')).toBe('mistake');
    expect(classify(2.01, 'endgame')).toBe('blunder');
  });
});

describe('cpLossFor 走子方损失', () => {
  it('白方走差:E_before > E_after → 正损失', () => {
    // 白方视角:之前 +1.5(白优),走完 +0.5 → 白方损失 1 兵
    expect(cpLossFor('w', 150, 50)).toBeCloseTo(1.0);
  });
  it('黑方视角:E_after(白)>E_before(白)说明黑变差', () => {
    // 黑方走之前白优 +0.3,走完后白优 +2.0 → 黑方损失 1.7 兵
    expect(cpLossFor('b', 30, 200)).toBeCloseTo(1.7);
  });
  it('走好步(等于最佳)→ 损失 0,不出现负值', () => {
    expect(cpLossFor('w', 100, 100)).toBe(0);
    expect(cpLossFor('b', 100, 50)).toBe(0); // 黑方让白方优势缩小,是黑方赚
  });
  it('估值为空 → null', () => {
    expect(cpLossFor('w', null, 50)).toBeNull();
    expect(cpLossFor('b', 30, null)).toBeNull();
  });
});

describe('accuracyOf', () => {
  it('损失 0 → 100,损失越大越低', () => {
    expect(accuracyOf(0)).toBe(100);
    const a = accuracyOf(1.5)!;
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(accuracyOf(0.5)!);
    expect(accuracyOf(null)).toBeNull();
  });
});

describe('winProbWhite 局势条胜率', () => {
  it('0 → 0.5;正值更高;负数更低', () => {
    expect(winProbWhite(0, null)).toBeCloseTo(0.5);
    expect(winProbWhite(200, null)).toBeGreaterThan(0.5);
    expect(winProbWhite(-200, null)).toBeLessThan(0.5);
    expect(winProbWhite(100000, null)).toBeGreaterThan(0.999);
  });
  it('将杀直接 0/1', () => {
    expect(winProbWhite(null, 3)).toBe(1);
    expect(winProbWhite(null, -2)).toBe(0);
  });
  it('无数据 → 50%', () => {
    expect(winProbWhite(null, null)).toBe(0.5);
  });
});

describe('evalDisplay', () => {
  it('母分转兵数文本(1 位小数)', () => {
    expect(evalDisplay(85, null)).toBe('+0.9'); // 0.85 四舍五入
    expect(evalDisplay(84, null)).toBe('+0.8');
    expect(evalDisplay(-120, null)).toBe('-1.2');
    expect(evalDisplay(1050, null)).toBe('+10.5');
  });
  it('将杀文本', () => {
    expect(evalDisplay(null, 3)).toBe('M3');
    expect(evalDisplay(null, -4)).toBe('-M4');
  });
  it('空数据', () => {
    expect(evalDisplay(null, null)).toBe('');
  });
});
