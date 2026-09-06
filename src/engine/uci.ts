// Stockfish UCI 封装
// 设计:parseUciInfoLine 等解析函数为纯函数(可单测);UciEngine 通过注入的
// UciWorker(真实 Web Worker 或测试假件)通信,不依赖 DOM。

export interface UciWorker {
  postMessage(msg: string): void;
  onmessage: ((e: { data: string }) => void) | null;
  terminate(): void;
}

export interface EngineInfo {
  depth: number;
  scoreCp: number | null; // 走子方视角母分
  scoreMate: number | null; // 走子方视角将杀步数
  pv: string[]; // UCI 着法序列
}

export interface SearchResult {
  bestMove: string | null;
  ponder: string | null;
  /** 搜索过程中最后一条完整 info(depth/score/pv),用于粗估 */
  info: EngineInfo | null;
}

/** 解析一行 "info ..." → EngineInfo | null */
export function parseUciInfoLine(line: string): EngineInfo | null {
  if (!line.startsWith('info ')) return null;
  const m = line.match(/\bdepth\s+(\d+)/);
  if (!m) return null;
  let scoreCp: number | null = null;
  let scoreMate: number | null = null;
  const sCp = line.match(/\bscore\s+cp\s+(-?\d+)/);
  const sMate = line.match(/\bscore\s+mate\s+(-?\d+)/);
  if (sCp) scoreCp = parseInt(sCp[1], 10);
  if (sMate) scoreMate = parseInt(sMate[1], 10);
  const pvM = line.match(/\bpv\s+([a-h1-8a-z]+(?:\s+[a-h1-8a-z]+)*)/);
  const pv = pvM ? pvM[1].trim().split(/\s+/) : [];
  return { depth: parseInt(m[1], 10), scoreCp, scoreMate, pv };
}

/** 解析 "bestmove e2e4 ponder e7e5" */
export function parseBestMoveLine(line: string): { bestMove: string | null; ponder: string | null } {
  const m = line.match(/^bestmove\s+(\S+)/);
  if (!m) return { bestMove: null, ponder: null };
  const p = line.match(/ponder\s+(\S+)/);
  return { bestMove: m[1], ponder: p ? p[1] : null };
}

function cpText(whitePerspCp: number | null, whitePerspMate: number | null): { cp: number | null; mate: number | null } {
  return { cp: whitePerspCp, mate: whitePerspMate };
}

/**
 * 把"走子方视角"的 UCI score 换算成白方视角。
 * UCI 协议中 score 一律相对"轮到走子的一方";传入 stm('w'|'b')。
 */
export function toWhitePersp(stm: 'w' | 'b', cp: number | null, mate: number | null) {
  const sign = stm === 'w' ? 1 : -1;
  return {
    cpWhite: cp == null ? null : sign * cp,
    mateWhite: mate == null ? null : sign * mate,
  };
}

export type UciEngineEvents = Partial<{
  onLine: (line: string) => void;
}>;

/**
 * 线程安全的简单 UCI 控制器:
 * - init(): 发送 uci,等待 uciok
 * - setSkill / position / goDepth / goTime:按队列串行
 * - 所有 await 都带超时,超时抛错(调用方决定兜底)
 */
export class UciEngine {
  private ready = false;
  private busy = false;
  private pending: (() => void)[] = [];
  private lastInfo: EngineInfo | null = null;
  private bestResolve: ((r: SearchResult) => void) | null = null;
  private lineHandler: ((line: string) => void) | null = null;
  private w: UciWorker;

  constructor(w: UciWorker) {
    this.w = w;
    w.onmessage = (e) => this.onData(String(e.data));
  }

  private onData(data: string) {
    for (const raw of data.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      this.lineHandler?.(line);
      if (line === 'uciok') this.ready = true;
      const info = parseUciInfoLine(line);
      if (info) {
        // 保留深度最深的一条(同深度时保留后到的,pv 更完整)
        if (!this.lastInfo || info.depth >= this.lastInfo.depth) this.lastInfo = info;
      }
      if (line.startsWith('bestmove')) {
        const { bestMove, ponder } = parseBestMoveLine(line);
        const r: SearchResult = { bestMove, ponder, info: this.lastInfo };
        this.lastInfo = null;
        this.busy = false;
        const res = this.bestResolve;
        this.bestResolve = null;
        res?.(r);
        this.flush();
      }
    }
  }

  private flush() {
    while (!this.busy && this.pending.length) {
      const next = this.pending.shift()!;
      this.busy = true;
      next();
    }
  }

  private send(cmd: string) {
    this.w.postMessage(cmd);
  }

  private waitReady(timeoutMs = 8000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ready) return resolve();
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (this.ready) {
          clearInterval(iv);
          resolve();
        } else if (Date.now() - t0 > timeoutMs) {
          clearInterval(iv);
          reject(new Error('engine init timeout'));
        }
      }, 30);
    });
  }

  /** 启动并等待 uciok。重复调用安全。 */
  async init(timeoutMs = 10000): Promise<void> {
    if (this.ready) return;
    this.send('uci');
    await this.waitReady(timeoutMs);
    this.send('setoption name Threads value 1');
    this.send('setoption name Hash value 16');
  }

  async setOption(name: string, value: string | number) {
    await this.waitReady();
    this.send(`setoption name ${name} value ${value}`);
  }

  /** 需要同步完成内部状态再发下一条时调用 */
  async sync(timeoutMs = 4000): Promise<void> {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      const onReady = (line: string) => {
        if (line === 'readyok') {
          this.lineHandler = null;
          resolve();
        }
      };
      this.lineHandler = onReady;
      this.send('isready');
      setTimeout(() => {
        if (this.lineHandler === onReady) {
          this.lineHandler = null;
          reject(new Error('isready timeout'));
        }
      }, timeoutMs);
    });
  }

  position(fen: string | null, moves: string[]) {
    const pos = fen ? `position fen ${fen}` : 'position startpos';
    this.send(moves.length ? `${pos} moves ${moves.join(' ')}` : pos);
  }

  /** 立即停止当前搜索(保留已得结果,会触发 bestmove) */
  stop() {
    this.send('stop');
  }

  /** 队列执行一次搜索;resolve 于 bestmove */
  private enqueue(task: () => void): Promise<SearchResult> {
    return new Promise<SearchResult>((resolve) => {
      this.pending.push(() => {
        this.bestResolve = resolve;
        task();
      });
      this.flush();
    });
  }

  /**
   * 原子搜索:position + go 作为同一队列任务下发,
   * 避免在引擎搜索中发 position(未定义行为)。
   * @param opts.depth / opts.movetime 二选一
   */
  search(opts: { fen: string | null; moves?: string[]; depth?: number; movetime?: number }): Promise<SearchResult> {
    this.lastInfo = null;
    return this.enqueue(() => {
      this.position(opts.fen, opts.moves ?? []);
      if (opts.depth != null) this.send(`go depth ${opts.depth}`);
      else if (opts.movetime != null) this.send(`go movetime ${opts.movetime}`);
      else this.send('go infinite');
    });
  }

  /**
   * 带超时的搜索:超时则 stop() 并等 bestmove(SF 收到 stop 立即回报)。
   * stop 之后队列里的下一个搜索会自动开始。
   */
  withTimeout(p: Promise<SearchResult>, deadlineMs: number): Promise<SearchResult> {
    return new Promise<SearchResult>((resolve, reject) => {
      const t = setTimeout(() => {
        this.stop();
      }, deadlineMs);
      p.then(
        (r) => {
          clearTimeout(t);
          resolve(r);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  }

  terminate() {
    this.w.onmessage = null;
    try {
      this.w.terminate();
    } catch {
      /* noop */
    }
  }
}

export { cpText };
