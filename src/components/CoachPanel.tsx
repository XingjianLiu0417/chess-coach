import { useEffect, useRef, useState } from 'react';
import { useStore } from '../game/store';

export default function CoachPanel() {
  const comments = useStore((s) => s.comments);
  const chat = useStore((s) => s.chat);
  const review = useStore((s) => s.review);
  const coachError = useStore((s) => s.coachError);
  const coach = useStore((s) => s.coach);
  const playerColor = useStore((s) => s.playerColor);
  const status = useStore((s) => s.status);
  const askCoach = useStore((s) => s.askCoach);
  const clearChat = useStore((s) => s.clearChat);
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  // 取最新一条讲解(可能正在流式)
  const latest = [...comments].reverse().find((c) => c && c.text.length > 0);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [latest?.text, review?.text, chat?.answer]);

  const canCoach = Boolean(coach.apiKey);
  const isOver = status === 'over';

  return (
    <div className="card coach-box">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>AI 教练{isOver ? ' · 终局' : ` · ${playerColor === 'w' ? '你执白' : '你执黑'}`}</h3>
        {!canCoach && (
          <button style={{ fontSize: 12, padding: '3px 8px' }} onClick={() => useStore.getState().setSettingsOpen(true)}>
            去配置密钥
          </button>
        )}
      </div>

      <div className="coach-comments" ref={boxRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {coachError && <div className="chat-item err">{coachError}</div>}
        {latest && (
          <div className="coach-comment">
            <div className="tag">
              {latest.streaming ? '讲解中…' : `第 ${latest.ply} 着讲解`}
            </div>
            <span className={latest.streaming ? 'cursor-blink' : ''}>{latest.text}</span>
          </div>
        )}
        {review && review.text && (
          <div className="coach-comment" style={{ borderColor: '#e8a33d' }}>
            <div className="tag" style={{ color: '#e8a33d' }}>对局复盘</div>
            <span className={review.busy ? 'cursor-blink' : ''}>{review.text}</span>
          </div>
        )}
        {chat && (
          <div className="chat-item">
            <div className="q">你问:{chat.question}</div>
            {chat.error ? (
              <div className="err">{chat.error}</div>
            ) : (
              <span className={chat.busy ? 'cursor-blink' : ''}>{chat.answer}</span>
            )}
          </div>
        )}
        {!latest && !review && !chat && !coachError && (
          <div className="hint">
            {canCoach ? '走一步棋,教练会点评这步好/坏并讲解原因;也可以随时提问。' : '在设置里填入 LLM API Key(支持 DeepSeek / Z.AI / MiniMax)后,教练讲解就会自动出现。'}
          </div>
        )}
      </div>

      {chat && chat.busy === false && (
        <div style={{ textAlign: 'right' }}>
          <button style={{ fontSize: 12, padding: '2px 8px' }} onClick={clearChat}>
            清除回答
          </button>
        </div>
      )}

      <div className="coach-chat">
        <input
          value={q}
          placeholder="问教练:这局面该怎么走?他有什么威胁?"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim()) {
              void askCoach(q);
              setQ('');
            }
          }}
          disabled={!canCoach}
        />
        <button className="primary" disabled={!canCoach || !q.trim()} onClick={() => { void askCoach(q); setQ(''); }}>
          问
        </button>
      </div>
    </div>
  );
}
