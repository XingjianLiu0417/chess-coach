import { useState } from 'react';
import { useStore } from '../game/store';
import { PROVIDER_PRESETS } from '../coach/llmClient';
import { testConnection } from '../coach/llmClient';

const PRESET_KEYS = Object.keys(PROVIDER_PRESETS);

export default function SettingsModal() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const coach = useStore((s) => s.coach);
  const setCoach = useStore((s) => s.setCoach);
  const engine = useStore((s) => s.engine);
  const setEngine = useStore((s) => s.setEngine);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  if (!open) return null;

  const applyPreset = (key: string) => {
    const p = PROVIDER_PRESETS[key as keyof typeof PROVIDER_PRESETS];
    setCoach({ baseUrl: p.baseUrl, model: p.model });
    setTestMsg(null);
  };

  const runTest = async () => {
    setTesting(true);
    setTestMsg(null);
    const r = await testConnection(useStore.getState().coach);
    setTestMsg(r.message);
    setTesting(false);
  };

  return (
    <div className="overlay" onMouseDown={() => setOpen(false)}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>设置</h2>

        <div className="form-row">
          <label>教练大模型(OpenAI 兼容 API)</label>
          <div className="seg">
            {PRESET_KEYS.map((k) => (
              <button key={k} className={coach.baseUrl === PROVIDER_PRESETS[k as keyof typeof PROVIDER_PRESETS].baseUrl ? 'on' : ''} onClick={() => applyPreset(k)}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <label>Base URL</label>
          <input value={coach.baseUrl} onChange={(e) => setCoach({ baseUrl: e.target.value })} placeholder="https://api.deepseek.com/v1" />
        </div>
        <div className="form-row">
          <label>API Key(仅保存在本浏览器)</label>
          <input type="password" value={coach.apiKey} onChange={(e) => setCoach({ apiKey: e.target.value })} placeholder="sk-…" />
        </div>
        <div className="form-row">
          <label>模型</label>
          <input value={coach.model} onChange={(e) => setCoach({ model: e.target.value })} placeholder="deepseek-chat" />
        </div>
        <div className="form-row">
          <label>自动讲解频率</label>
          <div className="seg">
            {(
              [
                ['every', '每步讲解'],
                ['mistakes', '仅失误后'],
                ['off', '关闭'],
              ] as const
            ).map(([v, t]) => (
              <button key={v} className={coach.explainMode === v ? 'on' : ''} onClick={() => setCoach({ explainMode: v })}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <label>引擎难度(当前:{engine.skillLevel})</label>
          <input type="range" min={1} max={20} value={engine.skillLevel} onChange={(e) => setEngine({ skillLevel: Number(e.target.value) })} />
        </div>
        <div className="form-row">
          <label style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={engine.showBestMove} onChange={(e) => setEngine({ showBestMove: e.target.checked })} />
            走子后显示引擎最佳着法(箭头)
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => void runTest()} disabled={testing}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          {testMsg && <span className={testMsg.startsWith('连接成功') ? 'hint' : 'err'} style={{ fontSize: 12.5 }}>{testMsg}</span>}
        </div>

        <div className="actions">
          <button onClick={() => setOpen(false)}>完成</button>
        </div>
      </div>
    </div>
  );
}
