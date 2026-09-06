/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// COOP/COEP:让跨域隔离开启,Stockfish 多线程版可用 SharedArrayBuffer
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders, host: true },
  preview: { headers: isolationHeaders },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
