import { createServer } from 'node:net'

import { expect, test } from '@playwright/test'

import { launchApp } from './app'

test('ports: a server opened by the test shows up live and disappears when it closes', async () => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const { app, close } = await launchApp()
  try {
    const page = await app.firstWindow()
    await page.locator('.lc-tile', { hasText: 'Ports' }).click()
    await expect(page.locator('.page-head__title')).toHaveText('Belegte Ports')

    const row = page
      .getByRole('list', { name: 'Lauschende Ports' })
      .locator('.port', {
        has: page.locator('.port__number', { hasText: String(port).padStart(5, '0') }),
      })
    await expect(row).toHaveCount(1)
    await expect(row.locator('.port__protocol')).toHaveText('TCP')
    await expect(row.locator('.port__scope')).toHaveText('Lokal')
    await expect(row).toContainText(`PID ${String(process.pid).padStart(5, '0')}`)

    // The page polls: closing the server removes the row without a reload.
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await expect(row).toHaveCount(0, { timeout: 10_000 })
  } finally {
    server.close()
    await close()
  }
})
