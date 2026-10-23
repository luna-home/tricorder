import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, type ElectronApplication } from '@playwright/test'

const CLI = resolve(__dirname, '../bin/logbuch')

export interface LaunchOptions {
  /** Runs before the app starts, e.g. to fill the database with {@link logbuchCli}. */
  seed?(dbPath: string): void
  env?: Record<string, string>
  /** System locale the main process sees (`--lang`). The e2e assertions are German by default. */
  lang?: string
}

export interface LaunchedApp {
  app: ElectronApplication
  /** Temp directory holding the test database and the app's userData. */
  dir: string
  /** `LOGBUCH_DB` of the app. The file only exists if `seed` created it. */
  dbPath: string
  close(): Promise<void>
}

/** Runs the Python CLI `bin/logbuch` against `dbPath` and returns its output. */
export function logbuchCli(dbPath: string, ...args: string[]): string {
  return execFileSync('python3', [CLI, ...args], {
    env: { ...process.env, LOGBUCH_DB: dbPath },
    encoding: 'utf8',
  })
}

/**
 * Starts the built app against a fresh temp directory. Never touches ~/.logbuch/logbuch.db
 * or the real userData.
 */
export async function launchApp({
  seed,
  env = {},
  lang = 'de-DE',
}: LaunchOptions = {}): Promise<LaunchedApp> {
  const dir = mkdtempSync(join(tmpdir(), 'tricorder-e2e-'))
  const dbPath = join(dir, 'logbuch.db')
  seed?.(dbPath)
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  )
  // Both set explicitly, so values from .env.* (direnv) never leak into a test run.
  const app = await electron.launch({
    args: ['.', `--lang=${lang}`],
    env: { ...baseEnv, LOGBUCH_DB: dbPath, TRICORDER_USER_DATA: join(dir, 'userData'), ...env },
  })
  return {
    app,
    dir,
    dbPath,
    async close() {
      await app.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
