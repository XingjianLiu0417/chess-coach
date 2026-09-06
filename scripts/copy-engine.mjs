// 把 stockfish.js 的引擎文件拷到 public/engine/(Vite 直接以静态资源提供)
// 用法:node scripts/copy-engine.mjs
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish.js');
const dst = join(root, 'public', 'engine');

const files = ['stockfish.wasm.js', 'stockfish.wasm'];

mkdirSync(dst, { recursive: true });
for (const f of files) {
  const from = join(src, f);
  if (!existsSync(from)) {
    console.error(`[copy-engine] 缺失:${from}`);
    process.exit(1);
  }
  copyFileSync(from, join(dst, f));
  console.log(`[copy-engine] ${f} → public/engine/${f}`);
}
console.log('[copy-engine] done');
