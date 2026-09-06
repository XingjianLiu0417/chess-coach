import { useStore } from '../game/store';
import { pieceGlyph, pieceStyle } from '../ui/pieces';
import type { Color } from '../types';

/** 玩家条:显示执色、AI/你、准确率 */
function PlayerStrip({ color, isHuman }: { color: Color; isHuman: boolean }) {
  const history = useStore((s) => s.history);
  const playerColor = useStore((s) => s.playerColor);
  const thinking = useStore((s) => s.thinking);
  const turn = useStore((s) => s.turn);
  const playing = useStore((s) => s.status) === 'playing';
  const moves = history.filter((r) => r.color === color);
  const accs = moves.map((m) => m.acc).filter((a): a is number => a != null);
  const acc = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null;
  const isTurn = turn === color && playing;
  const engineThinking = thinking && color !== playerColor;

  return (
    <div className="player-strip">
      <span className="name">
        <span className="piece-glyph" style={pieceStyle(color)}>
          {color === 'w' ? pieceGlyph('k') : pieceGlyph('k')}
        </span>
        <span style={{ color: isTurn ? '#fff' : undefined }}>
          {isHuman ? '你' : color === 'w' ? '电脑(白)' : '电脑(黑)'}
        </span>
        {engineThinking && (
          <span>
            <span className="thinking-dot" />
            思考中…
          </span>
        )}
      </span>
      {acc != null ? <span className="acc-badge">准确率 {acc}%</span> : <span className="acc-badge">--</span>}
    </div>
  );
}

/** 迷你局势曲线(以人类视角:上方=人优) */
function Curve() {
  const history = useStore((s) => s.history);
  const playerColor = useStore((s) => s.playerColor);
  const pts: { pct: number; color: Color }[] = [];
  for (const r of history) {
    const an = r.post;
    if (!an || (an.cpWhite == null && an.mateWhite == null)) continue;
    let cp = an.cpWhite ?? 0;
    if (an.mateWhite != null) cp = an.mateWhite > 0 ? 1000 : -1000;
    let p = 1 / (1 + Math.pow(10, -cp / 400)); // 白胜率
    if (playerColor === 'b') p = 1 - p;
    pts.push({ pct: (1 - p) * 100, color: r.color });
  }
  if (pts.length < 2) {
    return (
      <svg className="curve" viewBox="0 0 200 46">
        <line x1="0" y1="23" x2="200" y2="23" stroke="#4a453f" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
    );
  }
  const W = 200;
  const H = 46;
  const n = pts.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (p: number) => Math.max(1, Math.min(H - 1, (p / 100) * H));
  let d = '';
  pts.forEach((p, i) => {
    d += `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.pct).toFixed(1)} `;
  });
  return (
    <svg className="curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#4a453f" strokeWidth="1" strokeDasharray="3 3" />
      {pts.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.pct)} r={2} fill={p.color === playerColor ? '#81b64c' : '#d98c5f'} />
      ))}
      <path d={d} fill="none" stroke="#81b64c" strokeWidth="1.4" opacity={0.75} />
    </svg>
  );
}

const BADGE: Record<string, { text: string; cls: string }> = {
  best: { text: '★', cls: '#2ecc71' },
  good: { text: '好', cls: '#7fd98a' },
  inaccuracy: { text: '?!', cls: '#f1c40f' },
  mistake: { text: '?', cls: '#e67e22' },
  blunder: { text: '??', cls: '#e74c3c' },
};

export default function MovePanel() {
  const history = useStore((s) => s.history);
  const playerColor = useStore((s) => s.playerColor);
  const rows: React.ReactNode[] = [];
  for (let i = 0; i < history.length; i += 2) {
    const w = history[i];
    const b = history[i + 1];
    const num = Math.floor(i / 2) + 1;
    const cell = (r?: (typeof history)[number]) => {
      if (!r) return <div key={`e${i}`} className="mv even" />;
      const badge = r.verdict ? BADGE[r.verdict] : null;
      const isEngine = r.color !== playerColor;
      return (
        <div key={r.ply} className={`mv ${r.color === 'w' ? 'odd' : 'even'} ${isEngine ? 'engine' : ''}`}>
          <span className="san">{r.san}</span>
          {badge && (
            <span className="badge" style={{ background: badge.cls, color: '#1a1a1a' }}>
              {badge.text}
            </span>
          )}
        </div>
      );
    };
    rows.push(
      <div key={`n${num}`} className="num">
        {num}.
      </div>,
      cell(w),
      cell(b),
    );
  }
  const engineColor: Color = playerColor === 'w' ? 'b' : 'w';
  return (
    <div className="card">
      <PlayerStrip color={engineColor} isHuman={false} />
      <Curve />
      <PlayerStrip color={playerColor} isHuman />
      <div className="movelist">{rows.length ? rows : <div className="hint" style={{ gridColumn: '1 / -1' }}>走子后这里显示棋谱与评分</div>}</div>
    </div>
  );
}
