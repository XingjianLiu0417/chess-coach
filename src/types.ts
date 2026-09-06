// 共享类型定义
export type Color = 'w' | 'b';

export type Verdict = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export type Phase = 'opening' | 'middlegame' | 'endgame';

/** 引擎对某个局面的分析结果(白方视角胜率用 cpWhite) */
export interface EngineAnalysis {
  /** 白方视角母分估值(≠null 时有效);mate 时为空 */
  cpWhite: number | null;
  /** 将杀步数,正=对走子方将杀?——统一约定:正=白方将杀黑方 */
  mateWhite: number | null;
  /** 最佳着法 UCI */
  bestMove: string | null;
  /** 主变着法 UCI 列表 */
  pv: string[];
  /** 达到的搜索深度 */
  depth: number;
}

/** 一步棋的记录 */
export interface MoveRecord {
  ply: number; // 1-based 半回合
  san: string;
  uci: string;
  from: string;
  to: string;
  piece: string;
  captured?: string;
  color: Color; // 走子方
  fenAfter: string;
  /** 走完后的最佳续着分析(白方视角),由分析引擎填充 */
  post: EngineAnalysis | null;
  /** 走这步之前的局面估值(白方视角)——用于算走子方损失 */
  preEvalWhite: number | null;
  /** 走子方视角损失(兵),null=未算出 */
  cpLoss: number | null;
  verdict: Verdict | null;
  /** 该步准确率 0-100 */
  acc: number | null;
}

export type CoachExplainMode = 'every' | 'mistakes' | 'off';
export type CoachSide = 'human' | 'both';

export interface CoachSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** 自动讲解触发模式 */
  explainMode: CoachExplainMode;
  /** 只讲人的走子,还是双方都讲 */
  side: CoachSide;
}

export interface EngineSettings {
  skillLevel: number; // 1-20
  moveTimeMs: number; // 电脑思考时间
  /** 人走后是否展示引擎最佳着法箭头 */
  showBestMove: boolean;
}

export interface GameSettings {
  playerColor: Color;
  coach: CoachSettings;
  engine: EngineSettings;
}

export interface CoachMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
