// 棋子字形(用黑色实心字形 + CSS 颜色区分黑白)
import type { CSSProperties } from 'react';
import type { Color } from '../types';

const GLYPH: Record<string, string> = {
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

export function pieceGlyph(type: string): string {
  return GLYPH[type] ?? '?';
}

export function pieceStyle(color: Color): CSSProperties {
  return { color: color === 'w' ? '#f5f5f5' : '#2b2b2b', textShadow: color === 'w' ? '0 0 2px rgba(0,0,0,.6)' : 'none' };
}
