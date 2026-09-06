// 无头引擎冒烟测试(协议严格版):每条 go 等 bestmove 再发下一条
// 用法:node scripts/engine-smoke.mjs
import { Worker } from 'node:worker_threads';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = join(root, 'public', 'engine');
const engineFile = join(engineDir, 'stockfish.wasm.smoke.cjs');

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

const w = new Worker(new URL('./engine-smoke.cjs', import.meta.url), {
  workerData: { engineFile, baseUrl: `http://127.0.0.1:${port}` },
});

const results = [];
let readyResolve = null;
w.on('message', (m) => {
  const line = String(m);
  if (line === '__READY__') {
    readyResolve?.();
    return;
  }
  const hist = results[results.length - 1];
  if (hist) hist.push(line);
});

const send = (cmd) => w.postMessage(cmd);
const until = async (pred, timeoutMs = 8000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const hist = results[results.length - 1];
    if (hist && hist.some(pred)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timeout waiting: ${pred}`);
};

await new Promise((r) => (readyResolve = r));

// wasm 初始化是异步的 → 轮询重发 uci 直到 uciok
results.push([]);
for (let i = 0; i < 40 && !results[0].some((l) => l.startsWith('uciok')); i++) {
  send('uci');
  await new Promise((r) => setTimeout(r, 250));
}
if (!results[0].some((l) => l.startsWith('uciok'))) {
  console.error('引擎未响应 uciok,输出如下:');
  console.error(results[0].slice(0, 30).join('\n'));
  process.exit(1);
}
console.log('uciok 握手成功');

const cases = [
  {
    name: 'Nf3 之后(黑方走子)',
    cmds: ['position startpos moves e2e4 e7e5 g1f3', 'go movetime 1500'],
  },
  {
    name: '中局(白被将,1.e4 e5 2.f3? Qh4+ 后)',
    cmds: ['position fen r1bqkbnr/pppp1ppp/2n5/4p3/4P2q/5P2/PPPPP1PP/RNBQKBNR w KQkq - 2 4', 'go movetime 1500'],
  },
];
try {
  for (const c of cases) {
    results.push([]);
    for (const cmd of c.cmds) send(cmd);
    // 该引擎时间控制不可靠:等一小段后主动 stop,模拟应用行为
    await new Promise((r) => setTimeout(r, 400));
    send('stop');
    await until((l) => l.startsWith('bestmove'), 6000);
  }
} catch (e) {
  console.error('用例超时,已收到的输出:');
  for (let i = 0; i < results.length; i++) {
    console.error(`--- 组${i} (${results[i].length}行) ---`);
    console.error(results[i].slice(0, 40).join('\n'));
  }
  throw e;
}

w.terminate();
server.close();

const all = results.flat();
const idName = all.find((l) => l.startsWith('id name')) ?? '?';
console.log(`引擎标识:${idName}`);
for (let i = 0; i < cases.length; i++) {
  const lines = results[i + 1]; // results[0] 是握手组
  const bm = lines.find((l) => l.startsWith('bestmove'));
  const lastInfo = [...lines].reverse().find((l) => l.startsWith('info') && /score (cp|mate)/.test(l));
  const score = lastInfo ? lastInfo.match(/score (cp -?\d+|mate -?\d+)/)?.[1] : '(无)';
  const depth = lastInfo ? lastInfo.match(/depth (\d+)/)?.[1] : '-';
  console.log(`[${cases[i].name}] bestmove=${bm ?? '(无)'} depth=${depth} score=${score}`);
}
const ok = all.some((l) => /^id name Stockfish/.test(l)) && cases.every((_, i) => results[i + 1].some((l) => l.startsWith('bestmove')));
console.log(ok ? 'SMOKE_PASS' : 'SMOKE_FAIL');
process.exit(ok ? 0 : 1);
