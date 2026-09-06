import { useEffect, useState } from 'react';
import { useStore } from './game/store';
import BoardView from './components/BoardView';
import EvalBar from './components/EvalBar';
import MovePanel from './components/MovePanel';
import CoachPanel from './components/CoachPanel';
import ControlsBar from './components/ControlsBar';
import SettingsModal from './components/SettingsModal';

export default function App() {
  const engineReady = useStore((s) => s.engineReady);
  const engineError = useStore((s) => s.engineError);
  const status = useStore((s) => s.status);
  const resultText = useStore((s) => s.resultText);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const playerColor = useStore((s) => s.playerColor);
  const newGame = useStore((s) => s.newGame);
  const boot = useStore((s) => s.boot);

  useEffect(() => {
    void boot();
    newGame('w');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [copied, setCopied] = useState(false);

  const exportPgn = async () => {
    const pgn = useStore.getState().exportPgn();
    if (!pgn) return;
    try {
      await navigator.clipboard.writeText(pgn);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('复制棋谱(PGN)', pgn);
    }
  };

  const engineState = engineReady ? (
    <span style={{ color: 'var(--accent)', fontSize: 12.5 }}>● 引擎就绪</span>
  ) : (
    <span style={{ color: engineError ? 'var(--danger)' : 'var(--gold)', fontSize: 12.5 }}>
      {engineError ? `● ${engineError}` : '● 引擎加载中…'}
    </span>
  );

  return (
    <div className="app">
      <div className="topbar">
        <h1>♞ AI 国际象棋教练</h1>
        <span className="sub">每步评分 · 中文讲解 · 引擎对战</span>
        <span className="spacer" />
        {engineState}
        <button onClick={() => void exportPgn()} disabled={!useStore.getState().exportPgn()}>
          {copied ? '✓ 已复制棋谱' : '导出 PGN'}
        </button>
        <button onClick={() => setSettingsOpen(true)}>设置</button>
      </div>

      <div className="main">
        <div className="board-col">
          <EvalBar />
          <div className="board-box">
            <BoardView />
            {status === 'over' && resultText && (
              <div className="result-banner">
                <div className="big">{resultText}</div>
                <div className="hint" style={{ color: '#ddd' }}>
                  本局结束·你执{playerColor === 'w' ? '白' : '黑'}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="side-col">
          <MovePanel />
          <CoachPanel />
          <ControlsBar />
        </div>
      </div>

      <SettingsModal />
    </div>
  );
}
