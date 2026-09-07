/// <reference types="node" />
// 回归测试:真实 UciEngine 类对 Stockfish 完整链路(修复 "setoption Threads 致死" 后的守护)
// 曾复现:init 后 isready 无应答 → 根因是 init 里发送 setoption Threads。
import { describe, expect, it } from 'vitest';
import { Worker } from 'node:worker_threads';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UciEngine, type UciWorker } from './uci';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const engineDir = join(root, 'public', 'engine');

let portRef = 0;
function makeAdapter(): UciWorker {
  const w = new Worker(new URL('../../scripts/engine-smoke.cjs', import.meta.url), {
    workerData: {
      engineFile: join(engineDir, 'stockfish.wasm.smoke.cjs'),
      baseUrl: `http://127.0.0.1:${portRef}`,
    },
  });
  let onmsg: ((e: { data: string }) => void) | null = null;
  w.on('message', (m: unknown) => {
    const s = String(m);
    if (s === '__READY__') return;
    onmsg?.({ data: s });
  });
  return {
    postMessage: (msg: string) => w.postMessage(msg),
    set onmessage(fn: ((e: { data: string }) => void) | null) {
      onmsg = fn;
    },
    terminate: () => w.terminate(),
  } as UciWorker;
}

const server = createServer((req, res) => {
  const name = normalize(decodeURIComponent((req.url ?? '/').slice(1)));
  const fp = join(engineDir, name);
  if (existsSync(fp)) {
    res.writeHead(200, { 'content-type': 'application/wasm' });
    res.end(readFileSync(fp));
  } else {
    res.writeHead(404);
    res.end('not found');
  }
});

describe('UciEngine × Stockfish 集成回归', () => {
  it('init→setSkill→sync→go depth→bestmove 全链路', async () => {
    await new Promise<void>((resolve) => {
      server.listen({ port: 0, host: '127.0.0.1' }, () => resolve());
    });
    portRef = (server.address() as { port: number }).port;
    try {
      const eng = new UciEngine(makeAdapter());
      await eng.init();
      await eng.setOption('Skill Level', 8);
      await eng.sync(); // isready → readyok
      const res = await Promise.race([
        eng.withTimeout(
          eng.search({ fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', depth: 12 }),
          2500,
        ),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('搜索硬超时')), 12000)),
      ]);
      expect(res.bestMove).toBeTruthy();
      expect(res.info?.depth ?? 0).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  }, 25000);
});
