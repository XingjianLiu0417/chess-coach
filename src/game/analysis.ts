// 走子质量判定 —— 纯函数模块,重点单测对象
import type { Phase, Verdict } from '../types';

export const BEST_EPSILON = 0.15; // 与引擎最佳相差 ≤0.15 兵 → 最佳

export const PHASE_THRESHOLDS: Record<Phase, { inaccuracy: number; mistake: number; blunder: number }> = {
  // 阈值单位:兵
  opening: { inaccuracy: 0.5, mistake: 1.0, blunder: 1.8 },
  middlegame: { inaccuracy: 0.8, mistake: 1.5, blunder: 2.5 },
  endgame: { inaccuracy: 0.5, mistake: 1.0, blunder: 1.8 },
};

/**
 * 按走子方视角的损失(兵)分类。
 * cpLoss 已归一化为"走子方"视角的非负损失。
 * 档位:≤0.15 最佳(best);达到 inaccuracy 阈值即升档,依此类推;
 * mistake 覆盖到 blunder 阈值(含),超过 blunder 为大漏招。
 */
export function classify(cpLoss: number, phase: Phase): Verdict {
  const t = PHASE_THRESHOLDS[phase];
  if (cpLoss <= BEST_EPSILON) return 'best';
  if (cpLoss < t.inaccuracy) return 'good';
  if (cpLoss < t.mistake) return 'inaccuracy';
  if (cpLoss <= t.blunder) return 'mistake';
  return 'blunder';
}

/**
 * 计算走子方损失(兵)。
 * @param mover 'w' | 'b' 谁走这步
 * @param bestEvalWhite 走之前局面的估值(白方视角)——引擎认为走子方"本该得到"的值
 * @param playedEvalWhite 走之后局面的估值(白方视角)——实际得到的值
 * 返回 mover 视角的损失,≥0;任一估值为 null → null
 */
export function cpLossFor(
  mover: 'w' | 'b',
  bestEvalWhite: number | null,
  playedEvalWhite: number | null,
): number | null {
  if (bestEvalWhite == null || playedEvalWhite == null) return null;
  const raw = mover === 'w' ? bestEvalWhite - playedEvalWhite : playedEvalWhite - bestEvalWhite;
  return Math.max(0, raw) / 100; // 母分 → 兵
}

/** 单步准确率:0-100,损失越大越低 */
export function accuracyOf(cpLoss: number | null): number | null {
  if (cpLoss == null) return null;
  const acc = 100 * Math.exp(-cpLoss / 1.5);
  return Math.min(100, Math.max(0, acc));
}

/** 白方胜率 0..1(用于局势条)。mate>0 白杀 → 1;mate<0 → 0 */
export function winProbWhite(cpWhite: number | null, mateWhite: number | null): number {
  if (mateWhite != null) return mateWhite > 0 ? 1 : 0;
  if (cpWhite == null) return 0.5;
  return 1 / (1 + Math.pow(10, -cpWhite / 400));
}

/** 估值展示文本,如 "+0.9" / "-M3"(白方视角;负面=M-3) */
export function evalDisplay(cpWhite: number | null, mateWhite: number | null): string {
  if (mateWhite != null) return (mateWhite > 0 ? 'M' : '-M') + Math.abs(mateWhite);
  if (cpWhite == null) return '';
  const pawns = Math.round(Math.abs(cpWhite) / 10) / 10; // 1 位小数,先放大再舍入
  const s = pawns >= 100 ? pawns.toFixed(0) : pawns.toFixed(1);
  return cpWhite < 0 ? '-' + s : '+' + s;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  best: '最佳',
  good: '好棋',
  inaccuracy: '不准确?!',
  mistake: '失误?',
  blunder: '大漏招??',
};

export const VERDICT_COLOR: Record<Verdict, string> = {
  best: '#2ecc71',
  good: '#7fd98a',
  inaccuracy: '#f1c40f',
  mistake: '#e67e22',
  blunder: '#e74c3c',
};
