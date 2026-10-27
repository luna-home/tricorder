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

test('the frame picks its density from the pointer, data-lc-density overrides it', async () => {
  const { app, close } = await launchApp()
  try {
    const page = await app.firstWindow()
    const nav = page.locator('.lc-nav').first()
    await expect(nav).toBeVisible()
    const navHeight = () => nav.evaluate((element) => element.getBoundingClientRect().height)
    const setDensity = (density: string) =>
      page.evaluate(
        (value) => document.documentElement.setAttribute('data-lc-density', value),
        density,
      )

    const fine = await page.evaluate(() => matchMedia('(pointer: fine)').matches)
    expect(await navHeight()).toBe(fine ? 34 : 50)
    await setDensity('touch')
    expect(await navHeight()).toBe(50)
    await setDensity('desk')
    expect(await navHeight()).toBe(34)
  } finally {
    await close()
  }
})
