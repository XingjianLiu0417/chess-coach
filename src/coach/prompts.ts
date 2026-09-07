// 教练讲解 prompt 模板
import type { CoachMsg, Color, Phase, Verdict } from '../types';
import { VERDICT_LABEL } from '../game/analysis';

export const COACH_SYSTEM = `你是国际象棋中文教练,讲解风格像 Chess.com 的真人教练:简短、具体、有鼓励性。规则:
1. 永远用中文。
2. 先说结论:刚走的这步是好棋还是坏棋(以给定标注为准),如果不好,指出大概损失了多少优势。
3. 如果不够好,给出引擎推荐的更好着法,并用"因为……"解释 1-2 个具体理由(子力、威胁、王的安全、兵结构、开放线),禁止"不够精确"这类空话。
4. 如果是好棋/最佳,肯定它,并给出一个后续计划建议。
5. 全文不超过 90 个汉字。不输出任何 markdown 符号、引号、换行以外的排版,直接输出讲解正文。
6. 不确定的特征(如某个开局名称)不要编造,宁可不提。
7. 用"你"称呼玩家。
8. 严禁虚构任何具体着法:提示中给出的"引擎建议着法"就是唯一可引用的具体着法(如 Nf3、cxd5);若提示标注建议未知,只能做原则性点评,禁止自创坐标、棋谱或"应走某子到某格"。
9. 解释理由时必须围绕提示给出的引擎建议着法展开,不得描述一个不存在的着法;提示给出几个候选就只评论这几个。`;

interface CommentaryContext {
  fen: string;
  lastMovesSan: string[]; // 最近若干着,已走的
  humanMoveSan: string; // 讲解对象(你刚走的)
  humanColor: Color;
  verdict: Verdict | null;
  cpLossPawns: number | null; // 走子方(人)视角损失
  evalText: string; // 走完后的局面估值(白方视角文本)
  /** 引擎认为你"在走之前本可下的"更好着法(来自走前局面的分析) */
  bestMoveSan: string | null;
  /** bestMoveSan 之后的续着(SAN) */
  pvSan: string[];
  /** 你走的这步是否就是引擎最佳 */
  userChoseEngineBest?: boolean;
  phase: Phase;
  moveNumber: number;
  isGameOver: boolean;
  gameResultText: string;
}

/** 自动讲解(针对人刚走的一步) */
export function buildCommentaryPrompt(c: CommentaryContext): CoachMsg[] {
  const verdictLine = c.verdict
    ? `标注:${VERDICT_LABEL[c.verdict]}${c.cpLossPawns != null ? `(相对最佳损失约 ${c.cpLossPawns.toFixed(1)} 兵)` : ''}`
    : '标注:未知';
  let engineLine: string;
  if (!c.bestMoveSan) {
    engineLine = '引擎建议着法:暂无(不可用)。你只能做原则性点评,不得虚构任何具体着法。';
  } else if (c.userChoseEngineBest) {
    engineLine = `引擎在你走棋前的最佳选择正是你走的 ${c.bestMoveSan}${c.pvSan.length ? ';该线后续大致:' + c.pvSan.slice(0, 3).join(' ') : ''}`;
  } else {
    engineLine = `引擎在你走棋前认为更优的着法是 ${c.bestMoveSan}${
      c.pvSan.length ? ';该着之后大致是 ' + c.pvSan.slice(0, 3).join(' ') : ''
    }`;
  }
  const user = [
    `局面(FEN):${c.fen}`,
    `最近着法:${c.lastMovesSan.join(' ') || '(对局开始)'}`,
    `${c.humanColor === 'w' ? '白方(你)' : '黑方(你)'}刚走了第 ${c.moveNumber} 着:${c.humanMoveSan}`,
    `${verdictLine}。`,
    `当前局面估值:${c.evalText}。${engineLine}。`,
    `对局阶段:${c.phase === 'opening' ? '开局' : c.phase === 'middlegame' ? '中局' : '残局'}。`,
    c.isGameOver ? `对局已结束:${c.gameResultText}。` : '',
    '请讲解这一步。',
  ]
    .filter(Boolean)
    .join('\n');
  return [
    { role: 'system', content: COACH_SYSTEM },
    { role: 'user', content: user },
  ];
}

/** 问教练(自由提问,带局面上下文;此时轮到人走,分析即当前局面) */
export function buildChatPrompt(c: Omit<CommentaryContext, 'verdict' | 'cpLossPawns' | 'isGameOver' | 'gameResultText' | 'userChoseEngineBest'> & { question: string }): CoachMsg[] {
  const user = [
    `局面(FEN):${c.fen}`,
    `最近着法:${c.lastMovesSan.join(' ') || '(对局开始)'}`,
    `${c.humanColor === 'w' ? '你是白方' : '你是黑方'},现在是你的回合。`,
    `当前局面估值:${c.evalText}。引擎建议着法:${c.bestMoveSan ?? '暂无'}${
      c.pvSan.length ? ' ,之后大致是 ' + c.pvSan.slice(0, 3).join(' ') : ''
    }。`,
    `对局阶段:${c.phase === 'opening' ? '开局' : c.phase === 'middlegame' ? '中局' : '残局'}。`,
    '',
    `玩家问题:${c.question}`,
    '',
    '请以教练身份回答:中文、具体棋理、≤150 汉字、不输出 markdown;提到具体着法时只能引用上面给出的引擎建议着法,不得虚构。',
  ].join('\n');
  return [
    { role: 'system', content: COACH_SYSTEM },
    { role: 'user', content: user },
  ];
}

/** 终局复盘总结 */
export function buildReviewPrompt(c: {
  pgn: string;
  humanColor: Color;
  resultText: string;
  stats: { humanAcc: number | null; engineAcc: number | null; worstMoveSan: string | null };
}): CoachMsg[] {
  const user = [
    `对局结束(${c.resultText}),你执${c.humanColor === 'w' ? '白' : '黑'}。完整棋谱:`,
    c.pgn,
    `你的准确率 ${c.stats.humanAcc?.toFixed(1) ?? '?'}%,对手 ${c.stats.engineAcc?.toFixed(1) ?? '?'}%。`,
    c.stats.worstMoveSan ? `你最失误的一步是 ${c.stats.worstMoveSan}。` : '',
    '请给 4-6 句中文复盘:这盘的关键转折、你做得好的地方、最需要改进的一类问题、下一步练棋建议。不用 markdown。',
  ].join('\n');
  return [
    { role: 'system', content: COACH_SYSTEM },
    { role: 'user', content: user },
  ];
}
