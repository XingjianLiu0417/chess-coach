// 引擎 worker 管理:分析引擎与对战引擎两个独立 worker + 诊断/自愈
import { UciEngine, type UciWorker } from './uci';

/** 引擎文件由 scripts/copy-engine.mjs 拷到 public/engine/ */
export const ENGINE_SCRIPT = '/engine/stockfish.wasm.js';

// ---------- 诊断环形缓冲 ----------
const diag: string[] = [];
export function pushDiag(scope: string, line: string) {
  const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  diag.push(`[${t}][${scope}] ${line}`);
  if (diag.length > 300) diag.splice(0, diag.length - 300);
}
export function engineDiagTail(n = 40): string[] {
  return diag.slice(-n);
}
export function clearEngineDiag() {
  diag.length = 0;
}

function makeEngine(scope: 'analyst' | 'player'): UciEngine {
  const worker = new Worker(ENGINE_SCRIPT);
  worker.addEventListener('error', (e) => pushDiag(scope, `WORKER ERROR: ${e.message}`));
  worker.addEventListener('messageerror', () => pushDiag(scope, 'messageerror'));
  const engine = new UciEngine(worker as unknown as UciWorker, {
    onInteresting: (line) => {
      // 全量关键事件:握手、就绪、回报、错误
      if (
        line.startsWith('id name') ||
        line.startsWith('id author') ||
        line === 'uciok' ||
        line === 'readyok' ||
        line.startsWith('bestmove') ||
        line.startsWith('info depth 1 ') ||
        /error|abort|fail|unknown/i.test(line)
      ) {
        pushDiag(scope, `<< ${line.slice(0, 120)}`);
      }
    },
    onSend: (cmd) => pushDiag(scope, `>> ${cmd}`),
  });
  return engine;
}

export interface EnginePair {
  /** 分析引擎:满力,用于评价走子/局势条/最佳着法 */
  analyst: UciEngine;
  /** 对战引擎:按 Skill Level 走子 */
  player: UciEngine;
}

let pair: EnginePair | null = null;

/** 惰性获取两个引擎(首次调用时创建) */
export function getEngines(): EnginePair {
  if (pair) return pair;
  pair = { analyst: makeEngine('analyst'), player: makeEngine('player') };
  return pair;
}

/** 重启某个引擎 worker(自愈)。返回新实例,后续 getEngines() 即取到它 */
export function restartEngine(kind: 'analyst' | 'player'): UciEngine {
  const cur = getEngines();
  const old = cur[kind];
  try {
    old?.terminate();
  } catch {
    /* ignore */
  }
  const fresh = makeEngine(kind);
  pair = kind === 'analyst' ? { analyst: fresh, player: cur.player } : { analyst: cur.analyst, player: fresh };
  pushDiag(kind, 'worker 已重启,待重新初始化');
  return fresh;
}

/** 确保指定引擎可用:未就绪则 init;init 失败则重启一次再试 */
export async function ensureEngine(kind: 'analyst' | 'player'): Promise<UciEngine> {
  let e = getEngines()[kind];
  if (!e.isReady()) {
    try {
      await e.init();
    } catch (err) {
      pushDiag(kind, `init 失败:${err instanceof Error ? err.message : String(err)}`);
      e = restartEngine(kind);
      await e.init();
    }
  }
  return e;
}

/** 难度设置 → Stockfish 参数 */
export function skillToEngineConfig(skill: number): { skillLevel: number; movetimeMs: number } {
  const s = Math.min(20, Math.max(1, Math.round(skill)));
  // 低等级短思考+高误差;高等级长思考
  const table: Record<number, number> = {
    1: 80, 2: 100, 3: 120, 4: 150, 5: 180, 6: 220, 7: 260, 8: 300, 9: 350, 10: 400,
    11: 480, 12: 560, 13: 660, 14: 780, 15: 900, 16: 1000, 17: 1100, 18: 1200, 19: 1400, 20: 1600,
  };
  return { skillLevel: s, movetimeMs: table[s] };
}
