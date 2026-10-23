import { expect, test } from '@playwright/test'

import { launchApp } from './app'

test('the app opens a window with the Luna Console frame', async () => {
  const { app, close } = await launchApp()
  try {
    const page = await app.firstWindow()
    await expect(page).toHaveTitle('Tricorder')
    await expect(page.locator('.lc-panel')).toBeVisible()
    const bridge = await page.evaluate(() => {
      const api = (globalThis as { tricorder?: Record<string, unknown> }).tricorder
      return api ? Object.keys(api).sort() : []
    })
    expect(bridge).toEqual(['invoke', 'locale', 'on', 'platform', 'services', 'settings'])
  } finally {
    await close()
  }
})

test('the window follows the language the main process picked', async () => {
  const { app, close } = await launchApp({ lang: 'en-US' })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('.lc-panel')).toBeVisible()
    const locale = await page.evaluate(
      () => (globalThis as { tricorder?: { locale?: string } }).tricorder?.locale,
    )
    expect(locale).toBe('en')
    await expect(page.locator('.lc-nav').first()).toHaveText(/home/i)
  } finally {
    await close()
  }
})
