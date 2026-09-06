import { describe, expect, it } from 'vitest';
import { parseBestMoveLine, parseUciInfoLine, toWhitePersp } from './uci';

describe('parseUciInfoLine', () => {
  it('解析普通 info 行(cp + pv)', () => {
    const line =
      'info depth 18 seldepth 24 multipv 1 score cp 42 nodes 12345 nps 1000000 hashfull 10 tbhits 0 time 123 pv e2e4 e7e5 g1f3 b8c6';
    const r = parseUciInfoLine(line);
    expect(r).not.toBeNull();
    expect(r!.depth).toBe(18);
    expect(r!.scoreCp).toBe(42);
    expect(r!.scoreMate).toBeNull();
    expect(r!.pv).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
  });
  it('解析 mate 分数', () => {
    const r = parseUciInfoLine('info depth 30 score mate 3 pv d8h4 g1f3 h4h1');
    expect(r!.scoreCp).toBeNull();
    expect(r!.scoreMate).toBe(3);
  });
  it('负分', () => {
    const r = parseUciInfoLine('info depth 12 score cp -155 pv e2e4');
    expect(r!.scoreCp).toBe(-155);
  });
  it('没有 depth 的行(如 uciok/readyok)返回 null', () => {
    expect(parseUciInfoLine('uciok')).toBeNull();
    expect(parseUciInfoLine('info string NNUE evaluation using nn-xxxxxxxx.nnue')).toBeNull();
  });
  it('无 pv 也能解析分数', () => {
    const r = parseUciInfoLine('info depth 8 score cp 0');
    expect(r!.scoreCp).toBe(0);
    expect(r!.pv).toEqual([]);
  });
});

describe('parseBestMoveLine', () => {
  it('解析 bestmove + ponder', () => {
    expect(parseBestMoveLine('bestmove e2e4 ponder e7e5')).toEqual({
      bestMove: 'e2e4',
      ponder: 'e7e5',
    });
  });
  it('无 ponder', () => {
    expect(parseBestMoveLine('bestmove a7a8q')).toEqual({ bestMove: 'a7a8q', ponder: null });
  });
  it('非法行', () => {
    expect(parseBestMoveLine('info depth 5')).toEqual({ bestMove: null, ponder: null });
  });
});

describe('toWhitePersp', () => {
  it('白方走子:分数不变', () => {
    expect(toWhitePersp('w', 42, null)).toEqual({ cpWhite: 42, mateWhite: null });
  });
  it('黑方走子:分数取反', () => {
    expect(toWhitePersp('b', -100, null)).toEqual({ cpWhite: 100, mateWhite: null });
    expect(toWhitePersp('b', 3, null)).toEqual({ cpWhite: -3, mateWhite: null });
  });
  it('mate 换算:黑方视角 mate -3(黑被将杀) → 白方 M3', () => {
    expect(toWhitePersp('b', null, -3)).toEqual({ cpWhite: null, mateWhite: 3 });
    expect(toWhitePersp('w', null, 2)).toEqual({ cpWhite: null, mateWhite: 2 });
  });
  it('null 保持 null', () => {
    expect(toWhitePersp('w', null, null)).toEqual({ cpWhite: null, mateWhite: null });
  });
});
