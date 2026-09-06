# ♞ AI 国际象棋教练(纯前端)

一个 chess.com 风格的本地国际象棋训练小应用:**和电脑教练对战,每走一步自动标注好棋/坏棋,并由 AI 教练用中文讲解**。

- 全部代码跑在浏览器里,无后端,无需注册;API Key 只存在你自己的浏览器 localStorage。
- 引擎:Stockfish(WASM,Web Worker 单线程)——走子、评分、最佳着法。
- 教练:任意 OpenAI 兼容 Chat API(DeepSeek / Z.AI / MiniMax 预置,可自定义)。

## 功能

| 功能 | 说明 |
|---|---|
| 对战 | 执白/执黑,难度 1–20 连续可调(新手到大师) |
| 走子评分 | 每步按"相对最佳着法的损失"标注 ★最佳/好棋/?!不准确/?失误/??大漏招;开局/中局/残局阈值自适应 |
| 局势条 & 曲线 | 实时胜率条、准确率、双方 eval 折线 |
| AI 教练 | 每步自动中文讲解(可设"仅失误后讲/关闭"),随时向教练提问,终局自动复盘 |
| 记谱 | SAN 棋谱、悔棋(整回合回退并重算)、导出 PGN |

## 运行

```bash
npm install          # 已配 postinstall 自动拷贝引擎文件到 public/engine/
npm run dev          # 开发 http://localhost:5173
npm run test         # 单元测试(vitest)
npm run build        # 产物在 dist/,可静态托管(纯前端)
```

> 若 `public/engine/` 缺失,手动执行 `npm run setup:engine`。

## 配置教练

点右上角 **设置**:

1. 选 Provider 预设(DeepSeek / Z.AI / MiniMax / custom),或填任意 OpenAI 兼容 `baseUrl` + `model`;
2. 填 API Key(DeepSeek 等官方 API 均已在浏览器 CORS 预检中放行,实测可用);
3. 点 **测试连接**;
4. 走棋即可看到讲解;频率与"仅失误后讲"可选。

## 技术要点(改代码前必读)

- 引擎为 `stockfish.js`(niklasf,SF 2019 multi-variant,WASM)**worker-only 构建**:顶层注册 `onmessage`,输出走 `postMessage`,wasm 按脚本同目录相对路径加载。
- **该引擎对 `go movetime` 的时间约束不可靠**——所有搜索都必须由上层到点发 `stop` 终止(见 `store.ts` 的 `withTimeout` 用法);引擎收到 stop 会立即回 `bestmove`。
- 引擎单线程(SF10 经典评估,无 NNUE):强度足够到"大师"档;如需更强可替换为 lichess-org/stockfish.js 现代 NNUE 构建(需另行下载并同样拷贝到 `public/engine/`)。
- 走子评分口径:每步损失 = 走前局面引擎估值 − 走后局面引擎估值(换算到走子方视角),按 `src/game/analysis.ts` 阈值分档,是近似算法(非 chess.com 精确复刻),阈值集中在 `PHASE_THRESHOLDS` 方便调参。
- 两个独立引擎 worker:**analyst**(满力,评价人走的每步/局势条)与 **player**(按难度走子),互不阻塞。
- 搜索串行由 `UciEngine` 队列保证,"position+go"原子入队,避免在引擎搜索中发送 position(协议未定义行为)。

## 目录

```
src/
  game/     chess.js 状态机、评分纯函数、全局 store(编排引擎与教练)
  engine/   UCI 封装(可单测解析器)、worker 管理
  coach/    LLM 流式客户端、prompt 模板
  components/ 棋盘/局势条/记谱/教练面板/控制条/设置
scripts/copy-engine.mjs   拷贝引擎到 public/engine(npm postinstall)
scripts/engine-smoke.mjs  无头 UCI 冒烟测试(node scripts/engine-smoke.mjs)
```

## 已知限制

- 讲解质量取决于所用模型;提示词要求 ≤90 字中文、讲具体棋理,但模型输出不保证完全符合。
- 纯前端意味着 Key 存 localStorage——个人自用没问题,别放公共电脑。
- 首次进入会自动开始一局白方;引擎加载约 1 秒。
