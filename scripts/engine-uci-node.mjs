// 用真实的 UciEngine 类(主线程逻辑)+ worker_threads 适配层完整跑一遍
// 若此测试也失败 → 主线程协议逻辑有 bug;若通过 → 浏览器 worker 环境问题
// 用法:node scripts/engine-uci-node.mjs
import { Worker } from 'node:worker_threads';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UciEngine } from '../src/engine/uci.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = join(root, 'public', 'engine');

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
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// UciWorker 形状的 worker_threads 适配层
function makeAdapter() {
  const w = new Worker(new URL('./engine-smoke.cjs', import.meta.url), {
    workerData: { engineFile: join(engineDir, 'stockfish.wasm.smoke.cjs'), baseUrl: `http://127.0.0.1:${port}` },
  });
  let onmsg = null;
  w.on('message', (m) => {
    if (m === '__READY__') return;
    onmsg?.({ data: String(m) });
  });
  return {
    postMessage: (msg) => w.postMessage(msg),
    set onmessage(fn) {
      onmsg = fn;
    },
    terminate: () => w.terminate(),
  };
}

const eng = new UciEngine(makeAdapter(), {
  onInteresting: (l) => console.log('  [引擎]', l.slice(0, 100)),
});
const t0 = Date.now();
const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

try {
  log('init…');
  await eng.init();
  log('uciok ✓');
  await eng.setOption('Skill Level', 8);
  log('sync…');
  await eng.sync();
  log('readyok ✓');
  const res = await Promise.race([
    eng.withTimeout(
      eng.search({ fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', depth: 12 }),
      2500,
    ),
    new Promise((_, rej) => setTimeout(() => rej(new Error('搜索硬超时')), 11000)),
  ]);
  log(`bestmove=${res.bestMove} depth=${res.info?.depth} score=${res.info?.scoreCp ?? res.info?.scoreMate}`);
  console.log('NODE_UCI_PASS');
  process.exit(0);
} catch (e) {
  console.error('NODE_UCI_FAIL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
}
