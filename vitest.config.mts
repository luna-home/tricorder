import vue from '@vitejs/plugin-vue'
import { configDefaults, defineConfig } from 'vitest/config'

import { alias } from './electron.vite.config.mts'

const node = [
  'src/main/**/*.{test,spec}.ts',
  'src/preload/**/*.{test,spec}.ts',
  'src/shared/**/*.{test,spec}.ts',
  'src/services/*.{test,spec}.ts',
  'src/services/*/main*.{test,spec}.ts',
  'src/services/*/main/**/*.{test,spec}.ts',
  'src/services/*/__tests__/**/*.{test,spec}.ts',
]
const web = ['src/renderer/**/*.{test,spec}.ts', 'src/services/*/ui/**/*.{test,spec}.ts']

export default defineConfig({
  plugins: [vue()],
  resolve: { alias },
  envDir: false,
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**', 'out/**', 'release/**'],
    projects: [
      { extends: true, test: { name: 'node', environment: 'node', include: node } },
      { extends: true, test: { name: 'web', environment: 'jsdom', include: web } },
    ],
  },
})
