// 局面辅助:阶段判定、走子方视角换算等(依赖 chess.js,但逻辑薄)
import { Chess } from 'chess.js';
import type { Phase } from '../types';

/** 统计非兵棋子数(双方合计,初始为 16) */
export function countNonPawnMaterial(game: Chess): number {
  let n = 0;
  for (const row of game.board()) {
    for (const sq of row) {
      if (sq && sq.type !== 'p') n++;
    }
  }
  return n;
}

/** 阶段判定:近似 —— 前 10 回合开局;非兵子力 ≤8 进入残局 */
export function detectPhase(game: Chess): Phase {
  if (game.moveNumber() <= 10) return 'opening';
  if (countNonPawnMaterial(game) <= 8) return 'endgame';
  return 'middlegame';
}

/** 局面中轮到的一方 */
export function sideToMove(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}
