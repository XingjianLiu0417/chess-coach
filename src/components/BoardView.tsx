import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';
import { useStore } from '../game/store';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PROMO_PIECES = ['q', 'r', 'b', 'n'] as const;
const PROMO_LABEL: Record<string, string> = { q: '♛ 后', r: '♜ 车', b: '♝ 象', n: '♞ 马' };

/** 从 FEN 取某格棋子,如 {type:'p',color:'w'} | null */
function pieceAt(fen: string, square: string): { type: string; color: 'w' | 'b' } | null {
  const boardPart = fen.split(' ')[0] ?? '';
  const rows = boardPart.split('/');
  const fileIdx = square.charCodeAt(0) - 97; // a=0
  const rankIdx = 8 - Number(square[1]); // rank8 → 0
  const row = rows[rankIdx];
  if (!row) return null;
  let col = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) {
      col += Number(ch);
      continue;
    }
    if (col === fileIdx) {
      return { type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' };
    }
    col++;
  }
  return null;
}

export default function BoardView() {
  const fen = useStore((s) => s.fen);
  const playerColor = useStore((s) => s.playerColor);
  const status = useStore((s) => s.status);
  const thinking = useStore((s) => s.thinking);
  const history = useStore((s) => s.history);
  const analysis = useStore((s) => s.analysis);
  const engine = useStore((s) => s.engine);
  const turn = useStore((s) => s.turn);
  const userMove = useStore((s) => s.userMove);

  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);

  const myTurn = status === 'playing' && !thinking && turn === playerColor;
  const curFen = fen === 'start' ? START_FEN : fen;

  const isPromotionMove = (from: string, to: string): boolean => {
    const p = pieceAt(curFen, from);
    if (!p || p.type !== 'p' || p.color !== turn) return false;
    const lastRank = p.color === 'w' ? '8' : '1';
    return to[1] === lastRank;
  };

  const handleMove = (from: string, to: string): boolean => {
    if (isPromotionMove(from, to)) {
      setPromo({ from, to });
      return false; // 等用户选升变子
    }
    const ok = userMove(from, to);
    if (ok) setSelected(null);
    return ok;
  };

  // 高亮:最后一步 + 选中格 + 人刚走的评分色 + 被将军的王
  const squareStyles: Record<string, CSSProperties> = {};
  const last = history[history.length - 1];
  if (last) {
    for (const sq of [last.from, last.to]) {
      squareStyles[sq] = { ...(squareStyles[sq] ?? {}), background: 'rgba(255, 213, 0, 0.42)' };
    }
    if (last.verdict && last.color === playerColor) {
      const good = last.verdict === 'best' || last.verdict === 'good';
      const col = good ? '20,180,90' : '220,60,50';
      squareStyles[last.to] = { ...(squareStyles[last.to] ?? {}), background: `rgba(${col},0.38)` };
    }
  }
  if (selected) {
    squareStyles[selected] = { ...(squareStyles[selected] ?? {}), background: 'rgba(80,170,80,0.45)' };
  }
  // 王被将军高亮
  {
    const rows = curFen.split(' ')[0].split('/');
    for (let r = 0; r < 8; r++) {
      let col = 0;
      for (const ch of rows[r] ?? '') {
        if (/\d/.test(ch)) {
          col += Number(ch);
          continue;
        }
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        if (ch.toLowerCase() === 'k' && color === turn) {
          const sq = String.fromCharCode(97 + col) + String(8 - r);
          squareStyles[sq] = {
            ...(squareStyles[sq] ?? {}),
            background:
              'radial-gradient(circle, rgba(255,0,0,0.75) 18%, rgba(255,0,0,0.35) 55%, transparent 100%)',
          };
        }
        col++;
      }
    }
  }

  const arrows =
    engine.showBestMove && analysis?.bestMove && status === 'playing' && turn === playerColor
      ? [
          {
            startSquare: analysis.bestMove.slice(0, 2),
            endSquare: analysis.bestMove.slice(2, 4),
            color: '#81b64c',
          },
        ]
      : [];

  return (
    <div style={{ position: 'relative' }}>
      <Chessboard
        options={{
          position: curFen,
          boardOrientation: playerColor === 'w' ? 'white' : 'black',
          allowDragging: myTurn,
          canDragPiece: () => myTurn,
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            targetSquare ? handleMove(sourceSquare, targetSquare) : false,
          onSquareClick: ({ square }) => {
            if (!myTurn) return;
            if (!selected) {
              const p = pieceAt(curFen, square);
              if (p && p.color === turn) setSelected(square);
              return;
            }
            if (square === selected) {
              setSelected(null);
              return;
            }
            const p = pieceAt(curFen, square);
            if (p && p.color === turn) {
              setSelected(square); // 换选自己的子
              return;
            }
            handleMove(selected, square);
          },
          squareStyles,
          arrows,
          showNotation: true,
          animationDurationInMs: 160,
          darkSquareStyle: { backgroundColor: '#739552' },
          lightSquareStyle: { backgroundColor: '#ebecd0' },
        }}
      />

      {thinking && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 8,
            background: 'rgba(0,0,0,0.15)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
          }}
        >
          <span style={{ marginTop: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', padding: '3px 14px', borderRadius: 20, fontSize: 13.5 }}>
            <span className="thinking-dot" />
            电脑教练思考中…
          </span>
        </div>
      )}

      {promo && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
          }}
        >
          <div style={{ background: '#312e2b', borderRadius: 10, padding: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#a8a29a' }}>升变为:</span>
            {PROMO_PIECES.map((p) => (
              <button
                key={p}
                style={{ fontSize: 24, padding: '4px 10px', background: '#46413c' }}
                onClick={() => {
                  const { from, to } = promo;
                  setPromo(null);
                  userMove(from, to, p);
                  setSelected(null);
                }}
              >
                {PROMO_LABEL[p]}
              </button>
            ))}
            <button onClick={() => setPromo(null)} style={{ marginLeft: 4 }}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
