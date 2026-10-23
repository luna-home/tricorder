import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'electron-vite'

// Terminals inside VS Code (and Claude Code) export ELECTRON_RUN_AS_NODE=1. electron-vite
// passes its own environment to the Electron it spawns, which would then start as plain Node.
delete process.env.ELECTRON_RUN_AS_NODE

const dir = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export const alias = {
  '@renderer': dir('./src/renderer'),
  '@shared': dir('./src/shared'),
  '@services': dir('./src/services'),
}

// No .env files: direnv loads .env.$LUNA_ENV into the process (see .envrc).
export default defineConfig({
  main: {
    envDir: false,
    resolve: { alias },
  },
  preload: {
    envDir: false,
    resolve: { alias },
  },
  renderer: {
    envDir: false,
    resolve: { alias },
    plugins: [vue(), tailwindcss()],
    // Renderer warnings, errors and unhandled rejections (Vue warnings too) in the dev terminal.
    // Vite only turns this on by itself when it detects a coding agent.
    server: { forwardConsole: true },
  },
})
