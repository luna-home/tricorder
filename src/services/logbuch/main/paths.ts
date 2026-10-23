import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export type DbPathSource = 'env' | 'settings' | 'default'

export interface DbLocation {
  path: string
  source: DbPathSource
}

/** `~/.logbuch/logbuch.db`, as `DB_PATH` in `bin/logbuch`. */
export function defaultDbPath(home = homedir()): string {
  return join(home, '.logbuch', 'logbuch.db')
}

function expandHome(path: string, home: string): string {
  if (path === '~') return home
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home, path.slice(2))
  return path
}

/** Precedence: env `LOGBUCH_DB` > setting `dbPath` > default. The result is absolute. */
export function resolveDbLocation(
  env: NodeJS.ProcessEnv,
  dbPath: string | null,
  home = homedir(),
): DbLocation {
  const fromEnv = env.LOGBUCH_DB?.trim()
  if (fromEnv) return { path: resolve(expandHome(fromEnv, home)), source: 'env' }
  if (dbPath) return { path: resolve(expandHome(dbPath, home)), source: 'settings' }
  return { path: defaultDbPath(home), source: 'default' }
}
