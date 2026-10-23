import { defineConfig } from '@playwright/test'

// Electron e2e tests in e2e/. They launch the built app (out/), so `pnpm test:e2e` builds first.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
  },
})
