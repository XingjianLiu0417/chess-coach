// Node worker_threads 里加载 worker-only 的 Stockfish 构建(仅用于无头冒烟验证)
const { parentPort, workerData } = require('node:worker_threads');

globalThis.postMessage = (m) => parentPort.postMessage(m);

// 引擎在 worker 分支下用 fetch 拉 wasm,只给裸文件名 → 转成 http 绝对 URL
const origFetch = globalThis.fetch;
if (origFetch) {
  globalThis.fetch = (url, opts) => {
    let u = url;
    if (typeof u === 'string' && !/^[a-zA-Z]+:/.test(u)) {
      u = workerData.baseUrl + '/' + u;
    }
    return origFetch(u, opts);
  };
}

require(workerData.engineFile);
// 文件顶层已赋值全局 onmessage。这里把主线程发来的命令转给引擎。
setTimeout(() => {
  parentPort.on('message', (cmd) => {
    globalThis.onmessage({ data: String(cmd) });
  });
  parentPort.postMessage('__READY__');
}, 300);
