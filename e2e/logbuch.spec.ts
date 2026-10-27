import { existsSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { launchApp, logbuchCli } from './app'

// Direct children only: a topic's Spiegelstriche are list items too.
const openTopics = (page: Page) =>
  page.getByRole('list', { name: 'Offene Themen' }).locator(':scope > li')
const heading = (page: Page) => page.locator('.page-head__title')

test('logbuch: open topics, new entry, live CLI entry, two-tap done', async () => {
  const { app, dbPath, close } = await launchApp({
    seed: (db) => {
      logbuchCli(db, 'merk', 'Tricorder Electron', 'Gerüst steht', '--projekt', 'luna')
      logbuchCli(db, 'merk', 'Backup Nextcloud', 'Restore getestet', '--projekt', 'home')
    },
  })
  try {
    const page = await app.firstWindow()

    // Start page: frame, clock, logbuch tile and its live status.
    await expect(page).toHaveTitle('Tricorder')
    await expect(page.locator('.lc-panel__title')).toHaveText(/tricorder/i)
    await expect(page.locator('.lc-panel__clock')).toHaveText(/^\d{2}:\d{2}$/)
    const status = page.getByRole('region', { name: 'Status' }).locator('.lc-readout')
    await expect(status.filter({ hasText: 'Logbuch' }).locator('.lc-readout__value')).toHaveText(
      'Online',
    )

    // WO WAR ICH lists the fixture topics, newest first.
    await page.locator('.lc-tile', { hasText: 'Logbuch' }).click()
    await expect(heading(page)).toHaveText('Wo war ich')
    await expect(openTopics(page)).toHaveCount(2)
    await expect(openTopics(page).first()).toContainText('Backup Nextcloud')
    await expect(openTopics(page).nth(1)).toContainText('Tricorder Electron')

    // NEUER EINTRAG with a new topic opens its history.
    await page.getByRole('button', { name: 'Neuer Eintrag' }).click()
    await expect(heading(page)).toHaveText('Neuer Eintrag')
    await page.getByLabel('Projekt').fill('luna')
    await page.getByLabel('Thema').fill('E2E Thema')
    await page.getByLabel('Stand').fill('Aus der App eingetragen')
    await page.getByLabel('Weiter').fill('- Abschließen testen')
    await page.getByLabel('Weiter').press('Enter')
    await page.getByLabel('Weiter').pressSequentially('Pins testen')
    await page.getByRole('button', { name: 'Speichern' }).click()
    await expect(heading(page)).toHaveText('E2E Thema')
    await expect(page.getByRole('region', { name: 'Aktueller Stand' })).toContainText(
      'Aus der App eingetragen',
    )
    expect(logbuchCli(dbPath, 'zeig', 'E2E Thema', '--projekt', 'luna')).toContain(
      'Weiter: - Abschließen testen\n          - Pins testen',
    )

    // + STAND continues the topic with its newest entry.
    await page.getByRole('button', { name: '+ Stand' }).click()
    await expect(heading(page)).toHaveText('E2E Thema')
    await expect(page.getByLabel('Stand')).toHaveValue('Aus der App eingetragen')
    await page.getByRole('button', { name: 'Abbrechen' }).click()
    await expect(heading(page)).toHaveText('E2E Thema')

    // Back in WO WAR ICH the new topic is on top.
    await page.getByRole('button', { name: 'Zurück' }).click()
    await expect(heading(page)).toHaveText('Wo war ich')
    await expect(openTopics(page)).toHaveCount(3)
    await expect(openTopics(page).first()).toContainText('E2E Thema')

    // An entry written by the CLI shows up without a reload (fs.watch -> changed -> refetch).
    logbuchCli(dbPath, 'merk', 'Live vom CLI', 'Per Hook geschrieben', '--projekt', 'home')
    await expect(openTopics(page)).toHaveCount(4, { timeout: 15_000 })
    await expect(openTopics(page).first()).toContainText('Live vom CLI')

    // ABSCHLIESSEN: the first tap only arms, the second writes the done marker.
    await openTopics(page).filter({ hasText: 'E2E Thema' }).locator('a').click()
    await expect(heading(page)).toHaveText('E2E Thema')
    await page.getByRole('button', { name: 'Abschließen' }).click()
    await expect(heading(page)).toHaveText('Abschließen')
    const finish = page.locator('.lc-tile', { hasText: '01-END' })
    await finish.click()
    await expect(finish).toHaveAttribute('data-armed', 'true')
    await expect(finish).toContainText('Bestätigen?')
    expect(logbuchCli(dbPath, 'wo', '--projekt', 'luna')).toContain('E2E Thema')
    await finish.click()

    await expect(heading(page)).toHaveText('Wo war ich')
    await expect(openTopics(page)).toHaveCount(3)
    await expect(openTopics(page).filter({ hasText: 'E2E Thema' })).toHaveCount(0)
    expect(logbuchCli(dbPath, 'wo', '--projekt', 'luna')).not.toContain('E2E Thema')
  } finally {
    await close()
  }
})

test('logbuch: a missing database gives a yellow alert and is not created', async () => {
  const { app, dbPath, close } = await launchApp()
  try {
    const page = await app.firstWindow()
    const status = page.getByRole('region', { name: 'Status' }).locator('.lc-readout')
    const logbuchStatus = status.filter({ hasText: 'Logbuch' }).locator('.lc-readout__value')
    await expect(logbuchStatus).toHaveText('Nicht eingerichtet')
    await expect(logbuchStatus).toHaveAttribute('data-state', 'alert')

    await page.locator('.lc-tile', { hasText: 'Logbuch' }).click()
    await expect(page.locator('.lc-panel')).toHaveClass(/lc-yellow-alert/)
    const notice = page.locator('.lc-notice--yellow')
    await expect(notice).toContainText('Logbuch nicht gefunden')
    await expect(notice).toContainText('LOGBUCH_DB')
    await expect(page.locator('.setup-notice__path')).toContainText(dbPath)
    expect(existsSync(dbPath)).toBe(false)
  } finally {
    await close()
  }
})

test('logbuch: pins from CLI and app share the slots, Cmd/Ctrl+n jumps', async () => {
  const { app, dbPath, close } = await launchApp({
    seed: (db) => {
      logbuchCli(db, 'merk', 'Erstes', '- a', '--projekt', 'luna')
      logbuchCli(db, 'merk', 'Zweites', '- b', '--projekt', 'home')
      logbuchCli(db, 'anheften', 'Erstes', '--projekt', 'luna')
    },
  })
  try {
    const page = await app.firstWindow()
    const pins = page.getByRole('navigation', { name: 'Angeheftete Themen' })
    await page.locator('.lc-tile', { hasText: 'Logbuch' }).click()
    await expect(pins.getByRole('button')).toHaveText(['1 Erstes'])

    await openTopics(page).filter({ hasText: 'Zweites' }).locator('a').click()
    await expect(heading(page)).toHaveText('Zweites')
    await page.getByRole('button', { name: 'Anheften' }).click()
    await expect(pins.getByRole('button')).toHaveText(['1 Erstes', '2 Zweites'])
    expect(logbuchCli(dbPath, 'wo')).toContain('■ [2] home / Zweites')

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+1' : 'Control+1')
    await expect(heading(page)).toHaveText('Erstes')
  } finally {
    await close()
  }
})
