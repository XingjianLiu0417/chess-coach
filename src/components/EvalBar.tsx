import { useStore } from '../game/store';
import { evalDisplay, winProbWhite } from '../game/analysis';

export default function EvalBar() {
  const analysis = useStore((s) => s.analysis);
  const thinking = useStore((s) => s.thinking);
  const analyzing = useStore((s) => s.analyzing);

  const pWhite = winProbWhite(analysis?.cpWhite ?? null, analysis?.mateWhite ?? null);
  const whiteH = Math.round(pWhite * 100);
  const busy = thinking || analyzing;

  return (
    <div className="evalbar-wrap">
      <div className="evalbar-mid" />
      <div className="evalbar-text" style={{ top: 4 }}>
        {evalDisplay(analysis?.cpWhite ?? null, analysis?.mateWhite ?? null)}
      </div>
      {busy && <div className="evalbar-text" style={{ top: 'auto', bottom: 6, fontSize: 9 }}>…</div>}
      <div
        className="evalbar-fill"
        style={{ height: `${whiteH}%`, background: whiteH >= 50 ? '#f0f0f0' : '#3a3a3a' }}
      />
    </div>
  );
}
