import { join, resolve } from 'node:path'

import type { AppEnv } from './app-env'

/** Name of the userData folder of `pnpm dev`, so dev never shares settings with the installed app. */
export const DEV_USER_DATA_NAME = 'Tricorder Dev'

/**
 * userData directory, or `undefined` for Electron's default. Order: env `TRICORDER_USER_DATA`,
 * then `--user-data-dir=<dir>`, then a separate dev folder when not packaged.
 */
export function resolveUserData(options: {
  env: Partial<Pick<AppEnv, 'TRICORDER_USER_DATA'>>
  argv: readonly string[]
  isPackaged: boolean
  appData: string
}): string | undefined {
  const fromEnv = options.env.TRICORDER_USER_DATA
  if (fromEnv) return fromEnv
  const prefix = '--user-data-dir='
  const fromArg = options.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  if (fromArg) return resolve(fromArg)
  if (!options.isPackaged) return join(options.appData, DEV_USER_DATA_NAME)
  return undefined
}

/** True when the app was started by the login item (autostart): stay in the tray. */
export function startedHidden(argv: readonly string[], openedAtLogin: boolean): boolean {
  return openedAtLogin || argv.includes(HIDDEN_ARG)
}

/** Passed by the Windows login item; macOS reports `wasOpenedAtLogin` instead. */
export const HIDDEN_ARG = '--hidden'
