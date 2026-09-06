import { describe, expect, it } from 'vitest';
import { buildChatPrompt, buildCommentaryPrompt, buildReviewPrompt } from './prompts';

const ctx = {
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  lastMovesSan: ['e4', 'e5'],
  humanMoveSan: 'e4',
  humanColor: 'w' as const,
  verdict: 'good' as const,
  cpLossPawns: 0.2,
  evalText: '+0.3',
  bestMoveSan: 'e4',
  pvSan: ['d7d5', 'g1f3'],
  phase: 'opening' as const,
  moveNumber: 2,
  isGameOver: false,
  gameResultText: '',
};

describe('prompt 模板', () => {
  it('讲解 prompt:含局面、着法、标注、最佳着法与中文约束', () => {
    const msgs = buildCommentaryPrompt(ctx);
    expect(msgs[0].role).toBe('system');
    const sys = msgs[0].content;
    const user = msgs[1].content;
    expect(sys).toContain('永远用中文');
    expect(sys).toContain('不超过');
    expect(user).toContain(ctx.fen.slice(0, 20)); // FEN
    expect(user).toContain('e4');
    expect(user).toContain('好棋');
    expect(user).toContain('0.2');
    expect(user).toContain('引擎最佳着法');
    expect(user).not.toContain('markdown');
  });
  it('大漏招时 prompt 里带上 ?? 标注', () => {
    const msgs = buildCommentaryPrompt({ ...ctx, verdict: 'blunder', cpLossPawns: 3.2 });
    expect(msgs[1].content).toContain('大漏招');
    expect(msgs[1].content).toContain('3.2');
  });
  it('问教练 prompt:包含玩家问题', () => {
    const msgs = buildChatPrompt({ ...ctx, question: '我该怎么进攻王翼?' });
    const user = msgs[1].content;
    expect(user).toContain('我该怎么进攻王翼?');
    expect(user).toContain('玩家问题');
    expect(user).toContain('你的回合');
  });
  it('复盘 prompt:含完整 PGN 与准确率', () => {
    const msgs = buildReviewPrompt({
      pgn: '1. e4 e5 2. Nf3',
      humanColor: 'w',
      resultText: '白方将杀获胜!',
      stats: { humanAcc: 88.5, engineAcc: 94.1, worstMoveSan: 'Nf3' },
    });
    const user = msgs[1].content;
    expect(user).toContain('1. e4 e5 2. Nf3');
    expect(user).toContain('88.5');
    expect(user).toContain('94.1');
    expect(user).toContain('白方将杀获胜!');
  });
});
