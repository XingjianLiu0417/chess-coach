// 全局状态:对局 + 引擎编排 + 走子评分 + 教练讲解
// 单一 zustand store。chess.js 实例在模块级(非响应式),历史用数组同步维护。
import { create } from 'zustand';
import { Chess } from 'chess.js';
import type { Color, EngineAnalysis, EngineSettings, MoveRecord, Verdict, CoachMsg, CoachSettings } from '../types';
import { accuracyOf, classify, cpLossFor } from './analysis';
import { detectPhase, sideToMove } from './helpers';
import { getEngines, skillToEngineConfig } from '../engine/engines';
import { toWhitePersp } from '../engine/uci';
import { chatStream, loadSettings, saveSettings } from '../coach/llmClient';
import { buildCommentaryPrompt, buildChatPrompt, buildReviewPrompt } from '../coach/prompts';

const ANALYSIS_DEPTH = 12;
const ANALYSIS_MAX_MS = 2400; // 分析最多等这么久,到时 stop 取部分结果
const LS_ENGINE = 'chess-coach.engine.v1';

function loadEngineSettings(): EngineSettings {
  try {
    const raw = localStorage.getItem(LS_ENGINE);
    if (raw) return { skillLevel: 8, moveTimeMs: 300, showBestMove: false, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { skillLevel: 8, moveTimeMs: 300, showBestMove: false };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface CoachEntry {
  ply: number;
  text: string;
  streaming: boolean;
}

export interface ChatEntry {
  question: string;
  answer: string;
  busy: boolean;
  error: string | null;
}

export interface StoreState {
  // 对局
  fen: string;
  turn: Color;
  playerColor: Color;
  history: MoveRecord[];
  status: 'idle' | 'playing' | 'over';
  resultText: string | null;
  thinking: boolean; // 电脑思考中
  analyzing: boolean; // 分析引擎工作中
  analysis: EngineAnalysis | null; // 当前局面(白方视角)
  engineReady: boolean;
  engineError: string | null;
  // 设置
  engine: EngineSettings;
  coach: CoachSettings;
  settingsOpen: boolean;
  // 教练
  comments: (CoachEntry | null)[];
  coachBusy: boolean;
  coachError: string | null;
  chat: ChatEntry | null;
  review: { text: string; busy: boolean } | null;

  // actions
  setSettingsOpen: (open: boolean) => void;
  setEngine: (p: Partial<EngineSettings>) => void;
  setCoach: (p: Partial<CoachSettings>) => void;
  boot: () => Promise<void>;
  newGame: (playerColor: Color) => void;
  userMove: (from: string, to: string, promotion?: string) => boolean;
  undo: () => void;
  exportPgn: () => string;
  askCoach: (question: string) => Promise<void>;
  clearChat: () => void;
}

// ---------- 模块级非响应状态 ----------
let game = new Chess();
let epoch = 0; // 每次 newGame/undo 自增,使在途异步失效
let abortCoach: AbortController | null = null;

function gameOverText(): string {
  const g = game;
  if (g.isCheckmate()) {
    const winner: Color = g.turn() === 'w' ? 'b' : 'w';
    return winner === 'w' ? '白方将杀获胜!' : '黑方将杀获胜!';
  }
  if (g.isStalemate()) return '逼和(无子可动)';
  if (g.isThreefoldRepetition()) return '和棋(三次重复)';
  if (g.isInsufficientMaterial()) return '和棋(子力不足)';
  if (g.isDraw()) return '和棋';
  return '对局结束';
}

function fenToChess(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch {
    return new Chess();
  }
}

function phaseOfFen(fen: string) {
  return detectPhase(fenToChess(fen));
}

function uciToMove(uci: string): { from: string; to: string; promotion?: string } | null {
  if (uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  return { from, to, promotion };
}

function averageAcc(moves: MoveRecord[]): number | null {
  const accs = moves.map((m) => m.acc).filter((a): a is number => a != null);
  if (!accs.length) return null;
  return accs.reduce((a, b) => a + b, 0) / accs.length;
}

const VERDICT_RANK: Verdict[] = ['blunder', 'mistake', 'inaccuracy', 'good', 'best'];

// ---------- store ----------
export const useStore = create<StoreState>((set, get) => {
  const stopSearch = () => {
    try {
      const e = getEngines();
      e.player.stop();
      e.analyst.stop();
    } catch {
      /* engines not ready */
    }
  };

  const cancelCoach = () => {
    abortCoach?.abort();
    abortCoach = null;
  };

  // 对某个已落子局面跑一次分析,并把结果回填到第 ply 步
  const analyzeAndFinalize = async (ply: number) => {
    const rec = get().history[ply - 1];
    if (!rec) return;
    const epochNow = epoch;
    set({ analyzing: true });
    let an: EngineAnalysis | null = null;
    try {
      const e = getEngines();
      const res = await e.analyst.withTimeout(
        e.analyst.search({ fen: rec.fenAfter, depth: ANALYSIS_DEPTH }),
        ANALYSIS_MAX_MS,
      );
      if (epoch !== epochNow) return;
      const stm = sideToMove(rec.fenAfter);
      const { cpWhite, mateWhite } = toWhitePersp(stm, res.info?.scoreCp ?? null, res.info?.scoreMate ?? null);
      an = {
        cpWhite,
        mateWhite,
        bestMove: res.bestMove,
        pv: res.info?.pv ?? (res.bestMove ? [res.bestMove] : []),
        depth: res.info?.depth ?? 0,
      };
    } catch (err) {
      if (epoch === epochNow) console.warn('分析失败', err);
      an = null;
    }
    if (epoch !== epochNow) return;

    // 回填 post + 计算该步损失/徽章/准确率
    const idx = ply - 1;
    const rec2 = get().history[idx];
    if (!rec2) {
      set({ analyzing: false, analysis: an });
      return;
    }
    const prev = get().history[idx - 1] ?? null;
    const preEvalWhite = prev?.post?.cpWhite ?? null;
    const cpLoss = cpLossFor(rec2.color, preEvalWhite, an?.cpWhite ?? null);
    let verdict: Verdict | null = null;
    if (cpLoss != null && prev && prev.post) {
      verdict = classify(cpLoss, phaseOfFen(rec2.fenAfter));
    }
    const acc = accuracyOf(cpLoss);
    const patch: Partial<MoveRecord> = { post: an, cpLoss, verdict, acc };
    const history = get().history.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    set({ analyzing: false, analysis: an, history });
    afterFinalize(ply, verdict);
  };

  // 分析回填后:终局复盘 / 单步讲解
  const afterFinalize = (ply: number, verdict: Verdict | null) => {
    const st = get();
    const rec = st.history[ply - 1];
    if (!rec) return;
    const isHumanMove = rec.color === st.playerColor;
    const humanMoves = st.history.filter((r) => r.color === st.playerColor);
    const isGameOver = game.isGameOver();

    if (isGameOver && humanMoves.length) {
      fireReview();
      return;
    }
    if (!isHumanMove || isGameOver) return;
    const coach = st.coach;
    if (!coach.apiKey || coach.explainMode === 'off') return;
    if (coach.explainMode === 'mistakes' && !(verdict === 'mistake' || verdict === 'blunder')) return;
    fireCommentary(ply);
  };

  const sanOfUci = (uci: string, fen: string): string => {
    const m = uciToMove(uci);
    if (!m) return uci;
    try {
      return new Chess(fen).move(m).san;
    } catch {
      return uci;
    }
  };

  const evalTextOf = (an: EngineAnalysis | null): string => {
    if (!an) return '未知';
    if (an.mateWhite != null) return an.mateWhite > 0 ? `白方M${an.mateWhite}` : `黑方M${-an.mateWhite}`;
    if (an.cpWhite == null) return '未知';
    const p = Math.abs(an.cpWhite) / 100;
    return `${an.cpWhite < 0 ? '黑优' : '白优'}${p >= 1 ? p.toFixed(1) : (p * 100).toFixed(0)}分`;
  };

  // ---------- LLM 流式写回 ----------
  const streamToStore = async (ply: number | null, messages: CoachMsg[], intoReview: boolean) => {
    const coach = get().coach;
    if (!coach.apiKey) {
      set({ coachBusy: false, coachError: '未配置 API Key,请在设置中填写' });
      return;
    }
    cancelCoach();
    abortCoach = new AbortController();
    const sig = abortCoach.signal;
    if (ply != null) {
      set((s) => {
        const comments = [...s.comments];
        comments[ply - 1] = { ply, text: '', streaming: true };
        return { comments, coachBusy: true, coachError: null };
      });
    } else if (intoReview) {
      set({ review: { text: '', busy: true }, coachError: null });
    }
    try {
      let text = '';
      for await (const chunk of chatStream(coach, messages, sig)) {
        text += chunk;
        if (ply != null) {
          set((s) => {
            const comments = [...s.comments];
            comments[ply - 1] = { ply, text, streaming: true };
            return { comments };
          });
        } else if (intoReview) {
          set({ review: { text, busy: true } });
        }
      }
      if (ply != null) {
        set((s) => {
          const comments = [...s.comments];
          comments[ply - 1] = { ply, text, streaming: false };
          return { comments, coachBusy: false };
        });
      } else if (intoReview) {
        set({ review: { text, busy: false } });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = `讲解失败:${err instanceof Error ? err.message : String(err)}`;
      if (ply != null) {
        set((s) => {
          const comments = [...s.comments];
          const old = comments[ply - 1];
          comments[ply - 1] = old ? { ...old, streaming: false } : old;
          return { comments, coachBusy: false, coachError: msg };
        });
      } else {
        set({ review: { text: '', busy: false }, coachError: msg });
      }
    }
  };

  const fireCommentary = (ply: number) => {
    const st = get();
    const rec = st.history[ply - 1];
    if (!rec) return;
    const msgs = buildCommentaryPrompt({
      fen: rec.fenAfter,
      lastMovesSan: st.history.slice(-6).map((r) => r.san),
      humanMoveSan: rec.san,
      humanColor: st.playerColor,
      verdict: rec.verdict,
      cpLossPawns: rec.cpLoss,
      evalText: evalTextOf(rec.post),
      bestMoveSan: rec.post?.bestMove ? sanOfUci(rec.post.bestMove, rec.fenAfter) : null,
      pvSan: (rec.post?.pv ?? []).slice(1).map((u) => sanOfUci(u, rec.fenAfter)),
      phase: phaseOfFen(rec.fenAfter),
      moveNumber: rec.ply,
      isGameOver: false,
      gameResultText: '',
    });
    void streamToStore(ply, msgs, false);
  };

  const fireReview = () => {
    const st = get();
    const humanMoves = st.history.filter((r) => r.color === st.playerColor);
    if (!humanMoves.length) return;
    const worst = humanMoves.reduce<MoveRecord | null>((w, m) => {
      if (!m.verdict) return w;
      const rank = (v: Verdict | null) => (v ? VERDICT_RANK.indexOf(v) : -1);
      return !w || rank(m.verdict) > rank(w.verdict) ? m : w;
    }, null);
    const msgs = buildReviewPrompt({
      pgn: game.pgn(),
      humanColor: st.playerColor,
      resultText: gameOverText(),
      stats: {
        humanAcc: averageAcc(humanMoves),
        engineAcc: averageAcc(st.history.filter((r) => r.color !== st.playerColor)),
        worstMoveSan: worst?.san ?? null,
      },
    });
    void streamToStore(null, msgs, true);
  };

  // ---------- 电脑回合 ----------
  const computerTurn = async () => {
    const epochNow = epoch;
    if (game.turn() === get().playerColor) return;
    set({ thinking: true, engineError: null });
    try {
      const e = getEngines();
      const st = get();
      const { skillLevel, movetimeMs } = skillToEngineConfig(st.engine.skillLevel);
      await e.player.setOption('Skill Level', skillLevel);
      if (epoch !== epochNow) return;
      // 注意:该引擎对 movetime 的时间约束并不可靠,必须由我们到点发 stop。
      // withTimeout 在 movetimeMs 到点发 stop → 引擎立即回报 bestmove。
      const res = await Promise.race([
        e.player.withTimeout(e.player.search({ fen: game.fen(), movetime: movetimeMs }), movetimeMs),
        sleep(movetimeMs + 8000).then(() => {
          throw new Error('引擎长时间无响应');
        }),
      ]);
      if (epoch !== epochNow) return;
      const uci = res.bestMove;
      const m = uci ? uciToMove(uci) : null;
      const move = m ? safeMove(m) : null;
      if (!move) {
        if (epoch === epochNow) set({ thinking: false, engineError: '引擎未给出有效着法' });
        return;
      }
      await sleep(Math.max(0, 500 - movetimeMs));
      if (epoch !== epochNow) return;
      applyMove(move);
    } catch (err) {
      if (epoch === epochNow) {
        set({ thinking: false, engineError: `引擎出错:${err instanceof Error ? err.message : String(err)}` });
      }
    }
  };

  const safeMove = (m: { from: string; to: string; promotion?: string }): ReturnType<Chess['move']> | null => {
    try {
      return game.move(m);
    } catch {
      return null;
    }
  };

  // 落子后的通用流程(人/引擎共用)
  const applyMove = (move: NonNullable<ReturnType<Chess['move']>>) => {
    const preEvalWhite = get().analysis?.cpWhite ?? null; // 走之前局面的估值(白方视角)
    const rec: MoveRecord = {
      ply: get().history.length + 1,
      san: move.san,
      uci: (move.from + move.to + (move.promotion ?? '')).toLowerCase(),
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured,
      color: move.color,
      fenAfter: game.fen(),
      post: null,
      preEvalWhite,
      cpLoss: null,
      verdict: null,
      acc: null,
    };
    const humanTurnNow = game.turn() === get().playerColor;
    set({
      history: [...get().history, rec],
      fen: game.fen(),
      turn: game.turn(),
      thinking: !humanTurnNow,
      engineError: null,
    });
    const ply = rec.ply;
    const isOver = game.isGameOver();
    void analyzeAndFinalize(ply);
    if (isOver) {
      set({ status: 'over', resultText: gameOverText(), thinking: false });
      return;
    }
    if (!humanTurnNow) void computerTurn();
  };

  return {
    fen: 'start',
    turn: 'w',
    playerColor: 'w',
    history: [],
    status: 'idle',
    resultText: null,
    thinking: false,
    analyzing: false,
    analysis: null,
    engineReady: false,
    engineError: null,
    engine: loadEngineSettings(),
    coach: loadSettings(),
    settingsOpen: false,
    comments: [],
    coachBusy: false,
    coachError: null,
    chat: null,
    review: null,

    setSettingsOpen: (open) => set({ settingsOpen: open }),

    setEngine: (p) => {
      const next = { ...get().engine, ...p };
      localStorage.setItem(LS_ENGINE, JSON.stringify(next));
      set({ engine: next });
    },

    setCoach: (p) => {
      const next = { ...get().coach, ...p };
      saveSettings(next);
      set({ coach: next });
    },

    boot: async () => {
      try {
        const e = getEngines();
        await e.analyst.init();
        await e.analyst.setOption('Skill Level', 20);
        await e.player.init();
        const cfg = skillToEngineConfig(get().engine.skillLevel);
        await e.player.setOption('Skill Level', cfg.skillLevel);
        set({ engineReady: true, engineError: null });
      } catch (err) {
        set({ engineReady: false, engineError: `引擎初始化失败:${err instanceof Error ? err.message : String(err)}` });
      }
    },

    newGame: (playerColor) => {
      epoch++;
      cancelCoach();
      stopSearch();
      game = new Chess();
      const e0 = epoch;
      set({
        fen: game.fen(),
        turn: game.turn(),
        playerColor,
        history: [],
        status: 'playing',
        resultText: null,
        thinking: false,
        analyzing: false,
        analysis: null,
        comments: [],
        coachBusy: false,
        coachError: null,
        chat: null,
        review: null,
        coach: loadSettings(),
        engineError: null,
      });
      if (playerColor === 'b') {
        setTimeout(() => {
          if (epoch !== e0) return;
          void computerTurn();
        }, 700);
      }
    },

    userMove: (from, to, promotion) => {
      const st = get();
      if (st.status !== 'playing' || st.thinking) return false;
      if (game.turn() !== st.playerColor) return false;
      let move = safeMove({ from, to, promotion });
      if (!move && !promotion) move = safeMove({ from, to, promotion: 'q' });
      if (!move) return false;
      applyMove(move);
      return true;
    },

    undo: () => {
      const st = get();
      if (st.status === 'idle' || !st.history.length) return;
      epoch++;
      cancelCoach();
      stopSearch();
      const n = st.history.length;
      const last = st.history[n - 1];
      let removeCount = 1;
      if (last.color !== st.playerColor && st.history[n - 2]?.color === st.playerColor) {
        removeCount = 2; // 撤掉"引擎刚走 + 人刚走"两着
      }
      for (let i = 0; i < removeCount; i++) {
        if (!game.undo()) break;
      }
      const history = get().history.slice(0, Math.max(0, n - removeCount));
      const prev = history[history.length - 1] ?? null;
      set({
        history,
        fen: game.fen(),
        turn: game.turn(),
        status: 'playing',
        resultText: null,
        thinking: false,
        analyzing: false,
        analysis: prev?.post ?? null,
        comments: history.map(() => null),
        review: null,
        coachError: null,
      });
      // 悔棋后如果轮到引擎走(如执黑悔掉引擎第一步),自动补走
      const e2 = epoch;
      if (game.turn() !== get().playerColor) {
        setTimeout(() => {
          if (epoch !== e2) return;
          void computerTurn();
        }, 600);
      }
    },

    exportPgn: () => {
      try {
        return game.pgn();
      } catch {
        return '';
      }
    },

    askCoach: async (question) => {
      const st = get();
      if (!question.trim()) return;
      if (st.coachBusy) cancelCoach(); // 正在自动讲解 → 打断,优先回答提问
      const msgs = buildChatPrompt({
        fen: game.fen(),
        lastMovesSan: st.history.slice(-6).map((r) => r.san),
        humanMoveSan: st.history.length ? st.history[st.history.length - 1].san : '(开局)',
        humanColor: st.playerColor,
        evalText: evalTextOf(st.analysis),
        bestMoveSan: st.analysis?.bestMove ? sanOfUci(st.analysis.bestMove, game.fen()) : null,
        pvSan: (st.analysis?.pv ?? []).slice(1).map((u) => sanOfUci(u, game.fen())),
        phase: detectPhase(game),
        moveNumber: game.moveNumber(),
        question: question.trim(),
      });
      set({ chat: { question: question.trim(), answer: '', busy: true, error: null } });
      abortCoach?.abort();
      abortCoach = new AbortController();
      try {
        const coach = get().coach;
        if (!coach.apiKey) throw new Error('未配置 API Key,请在设置中填写');
        let text = '';
        for await (const chunk of chatStream(coach, msgs, abortCoach.signal)) {
          text += chunk;
          set({ chat: { question: question.trim(), answer: text, busy: true, error: null } });
        }
        set({ chat: { question: question.trim(), answer: text, busy: false, error: null } });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        set({
          chat: { question: question.trim(), answer: '', busy: false, error: err instanceof Error ? err.message : String(err) },
        });
      }
    },

    clearChat: () => set({ chat: null }),
  };
});
