// 引擎 worker 管理:创建分析引擎与对战引擎两个独立 worker
import { UciEngine, type UciWorker } from './uci';

/** 引擎文件由 scripts/copy-engine.mjs 拷到 public/engine/ */
export const ENGINE_SCRIPT = '/engine/stockfish.wasm.js';

/** 创建真实 Web Worker(浏览器环境)。Worker 满足 UciWorker 形状,做个窄化转换 */
export function createEngineWorker(): UciWorker {
  return new Worker(ENGINE_SCRIPT) as unknown as UciWorker;
}

export interface EnginePair {
  /** 分析引擎:满力,用于评价走子/局势条/最佳着法 */
  analyst: UciEngine;
  /** 对战引擎:按 Skill Level 走子 */
  player: UciEngine;
}

let pair: EnginePair | null = null;

/** 惰性初始化两个引擎(首次调用时)。失败抛错由调用方捕获 */
export function getEngines(): EnginePair {
  if (pair) return pair;
  const analyst = new UciEngine(createEngineWorker());
  const player = new UciEngine(createEngineWorker());
  pair = { analyst, player };
  return pair;
}

/** 难度设置 → Stockfish 参数 */
export function skillToEngineConfig(skill: number): { skillLevel: number; movetimeMs: number } {
  const s = Math.min(20, Math.max(1, Math.round(skill)));
  // 低等级短思考+高误差;高等级长思考
  const table: Record<number, number> = { 1: 80, 2: 100, 3: 120, 4: 150, 5: 180, 6: 220, 7: 260, 8: 300, 9: 350, 10: 400, 11: 480, 12: 560, 13: 660, 14: 780, 15: 900, 16: 1000, 17: 1100, 18: 1200, 19: 1400, 20: 1600 };
  return { skillLevel: s, movetimeMs: table[s] };
}

export async function initEngines(): Promise<void> {
  const e = getEngines();
  await e.analyst.init();
  await e.analyst.setOption('Skill Level', 20);
  await e.player.init();
  const { skillLevel } = skillToEngineConfig(20);
  await e.player.setOption('Skill Level', skillLevel);
}
