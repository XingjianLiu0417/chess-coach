// 教练 LLM 客户端:OpenAI 兼容 /chat/completions,流式 SSE
import type { CoachMsg, CoachSettings } from '../types';

export const PROVIDER_PRESETS = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  zai: { baseUrl: 'https://api.z.ai/api/paas/v4', model: 'glm-4.6' },
  minimax: { baseUrl: 'https://api.minimaxi.com/v1', model: 'MiniMax-Text-01' },
  custom: { baseUrl: '', model: '' },
} as const;

export const DEFAULT_SETTINGS: CoachSettings = {
  baseUrl: PROVIDER_PRESETS.deepseek.baseUrl,
  apiKey: '',
  model: PROVIDER_PRESETS.deepseek.model,
  temperature: 0.7,
  maxTokens: 300,
  explainMode: 'every',
  side: 'human',
};

const LS_KEY = 'chess-coach.settings.v1';

export function loadSettings(): CoachSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: CoachSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

/**
 * 流式对话。返回 async generator,逐段产出文本增量。
 * 若服务端不支持流式(返回非 SSE),自动退化为一次性返回全文。
 */
export async function* chatStream(
  s: CoachSettings,
  messages: CoachMsg[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const resp = await fetch(`${s.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify({
      model: s.model,
      messages,
      temperature: s.temperature,
      max_tokens: s.maxTokens,
      stream: true,
    }),
    signal,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`LLM 请求失败 ${resp.status}: ${body.slice(0, 200)}`);
  }
  const ct = resp.headers.get('content-type') ?? '';
  if (!resp.body || !ct.includes('text/event-stream')) {
    // 非流式(兼容):整段返回
    const json = await resp.json();
    const text = json?.choices?.[0]?.message?.content ?? '';
    if (text) yield text;
    return;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const j = JSON.parse(data);
        const delta: string = j?.choices?.[0]?.delta?.content ?? '';
        if (delta) yield delta;
      } catch {
        /* 忽略解析失败的碎片 */
      }
    }
  }
}

/** 测试连接:发一条最小消息,返回是否成功 */
export async function testConnection(s: CoachSettings): Promise<{ ok: boolean; message: string }> {
  if (!s.baseUrl || !s.apiKey) return { ok: false, message: '请先填写 API Key' };
  try {
    const gen = chatStream(s, [{ role: 'user', content: '回复:OK' }]);
    let got = '';
    for await (const c of gen) {
      got += c;
      if (got.length > 10) break; // 能流式返回即视为通
    }
    return { ok: true, message: `连接成功,响应:${got.slice(0, 30)}` };
  } catch (e) {
    return { ok: false, message: `连接失败:${e instanceof Error ? e.message : String(e)}` };
  }
}
