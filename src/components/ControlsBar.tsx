import { useStore } from '../game/store';
import { engineDiagTail } from '../engine/engines';
import type { Color } from '../types';

const SKILL_LABEL: [number, string][] = [
  [1, '入门'],
  [5, '新手'],
  [8, '业余'],
  [12, '好手'],
  [16, '强手'],
  [20, '大师'],
];

function labelOf(skill: number): string {
  let label = '';
  for (const [v, t] of SKILL_LABEL) {
    if (skill >= v) label = t;
  }
  return label;
}

export default function ControlsBar() {
  const status = useStore((s) => s.status);
  const thinking = useStore((s) => s.thinking);
  const engineError = useStore((s) => s.engineError);
  const engine = useStore((s) => s.engine);
  const setEngine = useStore((s) => s.setEngine);
  const undo = useStore((s) => s.undo);
  const history = useStore((s) => s.history);

  const start = (c: Color) => {
    useStore.getState().newGame(c);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="controls">
        <button
          className="primary"
          disabled={status === 'playing' && history.length === 0}
          onClick={() => start(useStore.getState().playerColor === 'w' ? 'b' : 'w')}
        >
          换边再来一局
        </button>
        <button className="primary" onClick={() => start('w')}>执白新局</button>
        <button className="primary" onClick={() => start('b')}>执黑新局</button>
        <button disabled={!history.length || status === 'idle'} onClick={undo}>
          悔棋
        </button>
        <div className="grow" />
        <label>
          难度
          <input
            type="range"
            min={1}
            max={20}
            value={engine.skillLevel}
            onChange={(e) => setEngine({ skillLevel: Number(e.target.value) })}
            style={{ width: 110 }}
          />
          <b>
            {engine.skillLevel}·{labelOf(engine.skillLevel)}
          </b>
        </label>
      </div>
      {thinking && (
        <div className="hint">
          <span className="thinking-dot" />
          电脑教练思考中…
        </div>
      )}
      {engineError && (
        <div>
          <div className="chat-item err">{engineError}</div>
          <details style={{ marginTop: 6 }}>
            <summary className="hint" style={{ cursor: 'pointer' }}>引擎诊断日志</summary>
            <pre
              style={{
                fontSize: 11,
                lineHeight: 1.4,
                background: '#1f1d1b',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: 8,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                maxHeight: 180,
                overflowY: 'auto',
              }}
            >
              {engineDiagTail(30).join('\n') || '(空)'}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
