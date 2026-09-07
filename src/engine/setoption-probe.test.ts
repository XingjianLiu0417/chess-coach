// 手动排查工具:ENGINE_PROBE=1 npx vitest run src/engine/setoption-probe.test.ts
// 分步观察引擎对每条命令的响应(曾用于定位 setoption Threads 致死 bug)
import { describe, it } from 'vitest';
import { Worker } from 'node:worker_threads';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rawSession(steps: { label: string; send: string | null; waitMs: number }[]) {
  const w = new Worker(new URL('../../scripts/engine-smoke.cjs', import.meta.url), {
    workerData: { engineFile: join(engineDir, 'stockfish.wasm.smoke.cjs'), baseUrl: `http://127.0.0.1:${portRef}` },
  });
  const lines: string[] = [];
  w.on('message', (m: unknown) => {
    const s = String(m);
    if (s !== '__READY__') lines.push(s);
  });
  await new Promise((r) => setTimeout(r, 500)); // 等 worker 就绪
  const before: Record<string, number> = {};
  for (const st of steps) {
    if (st.send) w.postMessage(st.send);
    await sleep(st.waitMs);
    const got = lines.slice(before[st.label] ?? 0);
    before[st.label] = lines.length;
    const key = got.filter((l) => !l.startsWith('info')).slice(-4).join('  ||  ');
    console.log(`[${st.label}] 新增${got.length}行 → ${key || '(无输出!)'}`);
  }
  w.terminate();
}

let portRef = 0;

const probeOn = process.env.ENGINE_PROBE === '1';

describe.skipIf(!probeOn)('Stockfish setoption 行为定位', () => {
  it('场景A:uci→isready(无setoption) 应正常', async () => {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    portRef = (server.address() as { port: number }).port;
    try {
      await rawSession([
        { label: 'uci 后', send: 'uci', waitMs: 1500 },
        { label: 'isready 后', send: 'isready', waitMs: 1200 },
      ]);
    } finally {
      server.close();
    }
  }, 30000);

  it('场景B:uci→setoption Threads→isready 是否开始装死', async () => {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    portRef = (server.address() as { port: number }).port;
    try {
      await rawSession([
        { label: 'uci 后', send: 'uci', waitMs: 1500 },
        { label: 'setoption Threads 后', send: 'setoption name Threads value 1', waitMs: 600 },
        { label: 'isready1 后', send: 'isready', waitMs: 1200 },
        { label: 'isready2 后', send: 'isready', waitMs: 1200 },
      ]);
    } finally {
      server.close();
    }
  }, 30000);

  it('场景C:uci→setoption Hash→isready', async () => {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    portRef = (server.address() as { port: number }).port;
    try {
      await rawSession([
        { label: 'uci 后', send: 'uci', waitMs: 1500 },
        { label: 'setoption Hash 后', send: 'setoption name Hash value 16', waitMs: 600 },
        { label: 'isready1 后', send: 'isready', waitMs: 1200 },
        { label: 'isready2 后', send: 'isready', waitMs: 1200 },
      ]);
    } finally {
      server.close();
    }
  }, 30000);

  it('场景D:uci→setoption Skill Level 8→isready(验证 Skill 是否也致死)', async () => {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    portRef = (server.address() as { port: number }).port;
    try {
      await rawSession([
        { label: 'uci 后', send: 'uci', waitMs: 1500 },
        { label: 'setoption Skill 后', send: 'setoption name Skill Level value 8', waitMs: 600 },
        { label: 'isready1 后', send: 'isready', waitMs: 1200 },
        { label: 'isready2 后', send: 'isready', waitMs: 1200 },
      ]);
    } finally {
      server.close();
    }
  }, 30000);

  it('场景E:uci→(Hash,Skill)→isready→go→stop→bestmove 完整链(无Threads)', async () => {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    portRef = (server.address() as { port: number }).port;
    try {
      await rawSession([
        { label: 'uci 后', send: 'uci', waitMs: 1500 },
        { label: 'Hash 后', send: 'setoption name Hash value 16', waitMs: 400 },
        { label: 'Skill 后', send: 'setoption name Skill Level value 8', waitMs: 400 },
        { label: 'isready 后', send: 'isready', waitMs: 1000 },
        { label: 'position/go 后', send: 'position startpos moves e2e4', waitMs: 100 },
        { label: 'stop/go', send: 'go movetime 1200', waitMs: 300 },
        { label: 'stop 后', send: 'stop', waitMs: 2500 },
      ]);
    } finally {
      server.close();
    }
  }, 30000);
});
