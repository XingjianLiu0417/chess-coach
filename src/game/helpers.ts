// 局面辅助:阶段判定、走子方视角换算等(依赖 chess.js,但逻辑薄)
import { Chess } from 'chess.js';
import type { Phase } from '../types';

/** 从 FEN 出发按顺序执行一串 UCI 着法,逐个转成 SAN;遇到非法着即停。
 *  用于把引擎主变(pv)转成可读棋谱——必须逐步推进局面,不能拿同一局面硬转。 */
export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  const out: string[] = [];
  let g: Chess;
  try {
    g = new Chess(fen);
  } catch {
    return out;
  }
  for (const uci of uciMoves) {
    if (uci.length < 4) break;
    try {
      const mv = g.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
      out.push(mv.san);
    } catch {
      break;
    }
  }
  return out;
}
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
