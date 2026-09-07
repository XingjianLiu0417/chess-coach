import { describe, expect, it } from 'vitest';
import { uciLineToSan } from './helpers';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('uciLineToSan 顺序转换', () => {
  it('开局主变逐步转 SAN', () => {
    expect(uciLineToSan(START, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
  });
  it('吃子标记正确', () => {
    // 1.e4 e5 2.Nf3 Nc6 后,白 Nf3 吃 e5 兵
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    expect(uciLineToSan(fen, ['f3e5'])).toEqual(['Nxe5']);
  });
  it('升变转成 a8=Q(无将军)', () => {
    const fen = '8/P7/4k3/8/8/8/8/4K3 w - - 0 1';
    expect(uciLineToSan(fen, ['a7a8q'])).toEqual(['a8=Q']);
  });
  it('中途非法则截断(不再硬转后续)', () => {
    // d8d7:黑后 d8 被己方 d7 兵挡住,非法 → 只转出前两着
    expect(uciLineToSan(START, ['e2e4', 'e7e5', 'd8d7'])).toEqual(['e4', 'e5']);
  });
  it('非法 FEN → 空数组', () => {
    expect(uciLineToSan('not-a-fen', ['e2e4'])).toEqual([]);
  });
});
