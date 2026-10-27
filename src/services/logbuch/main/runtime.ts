/**
 * Runtime of the logbuch service: follows the configured database file, keeps the service
 * status in sync with it, registers the contract methods and emits `changed` when the
 * database changes (through this service or from the CLI and the Claude Code hooks).
 */
import { type FSWatcher, watch } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname } from 'node:path'

import type { Dispose, ServiceContext } from '@shared/define-service'
import type { SettableServiceState, StatusReason } from '@shared/service'

import type { LogbuchContract } from '../contract'
import { type DbLocation, resolveDbLocation } from './paths'
import { DbMissingError, fileIdentity, LogbuchStore } from './store'

export interface LogbuchRuntimeOptions {
  /** Defaults to `process.env`; only `LOGBUCH_DB` is read. */
  env?: NodeJS.ProcessEnv
  home?: string
  /** Delay that coalesces bursts of file events into one `changed`. */
  debounceMs?: number
  /** Interval of the fallback check (file appeared or vanished, missed events). */
  recheckMs?: number
}

export const DEBOUNCE_MS = 300
export const RECHECK_MS = 5_000

export function startLogbuch(
  ctx: ServiceContext<LogbuchContract>,
  options: LogbuchRuntimeOptions = {},
): Dispose {
  const env = options.env ?? process.env
  const home = options.home ?? homedir()
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS

  let location: DbLocation = locate()
  let store: LogbuchStore | null = null
  let openError: string | null = null
  let watcher: FSWatcher | null = null
  /** The database file the watcher filters for; its directory is what is watched. */
  let watchedPath: string | null = null
  let lastFingerprint: string | null = null
  let lastStatus = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  function locate(): DbLocation {
    return resolveDbLocation(env, ctx.settings.get().dbPath, home)
  }

  function setStatus(state: SettableServiceState, reason?: StatusReason): void {
    const key = `${state}|${reason?.code ?? ''}|${reason?.detail ?? ''}`
    if (key === lastStatus) return
    lastStatus = key
    // The host logs every status change.
    ctx.status.set(state, reason)
  }

  function closeStore(): void {
    store?.close()
    store = null
  }

  /** Brings `store` and the status in line with the configured path and the file on disk. */
  function syncStore(): void {
    const next = locate()
    if (next.path !== location.path) {
      ctx.log.info(`database path ${next.path} (${next.source})`)
      closeStore()
    }
    location = next
    const identity = fileIdentity(location.path)
    if (store && store.identity !== identity) closeStore()
    if (!identity) {
      openError = null
      setStatus('unconfigured', { code: 'dbMissing', detail: location.path })
      return
    }
    if (!store) {
      try {
        store = LogbuchStore.open(location.path)
        openError = null
      } catch (error) {
        openError = error instanceof Error ? error.message : String(error)
        setStatus('error', { code: 'dbOpenFailed', detail: `${location.path}: ${openError}` })
        return
      }
    }
    setStatus('online')
  }

  function syncWatcher(): void {
    const path = location.path
    if (watcher && watchedPath === path) return
    watcher?.close()
    watcher = null
    watchedPath = null
    const names = new Set(['', '-journal', '-wal'].map((suffix) => basename(path) + suffix))
    try {
      watcher = watch(dirname(path), { persistent: false }, (_event, filename) => {
        if (!filename || names.has(filename.toString())) scheduleRefresh()
      })
      watchedPath = path
      // E.g. the directory was removed: drop the watcher, the periodic check re-creates it.
      watcher.on('error', () => {
        watcher?.close()
        watcher = null
        watchedPath = null
      })
    } catch {
      // Directory missing: the periodic check retries.
    }
  }

  /** Re-checks file and status and emits `changed` when the data visible to the UI changed. */
  function refresh(): void {
    if (disposed) return
    syncStore()
    syncWatcher()
    let fingerprint: string | null = null
    if (store) {
      try {
        fingerprint = store.fingerprint()
      } catch (error) {
        ctx.log.warn('fingerprint failed', error)
        closeStore()
      }
    }
    const key = `${location.path}|${fingerprint ?? 'none'}`
    if (lastFingerprint !== null && key !== lastFingerprint) ctx.emit('changed')
    lastFingerprint = key
  }

  function scheduleRefresh(): void {
    if (disposed) return
    clearTimeout(timer)
    timer = setTimeout(refresh, debounceMs)
  }

  /** The open store, or a clear error why there is none. */
  function requireStore(): LogbuchStore {
    syncStore()
    if (store) return store
    if (openError) throw new Error(`Cannot open logbuch database ${location.path}: ${openError}`)
    throw new DbMissingError(location.path)
  }

  ctx.handle('openTopics', ({ project, all, limit }) =>
    requireStore().openTopics(project, all ? undefined : limit),
  )
  ctx.handle('projects', () => requireStore().projects())
  ctx.handle('topics', ({ project }) => requireStore().topics(project))
  ctx.handle('history', ({ project, topic, limit }) =>
    requireStore().history(project, topic, limit),
  )
  ctx.handle('addEntry', ({ project, topic, status, nextStep, openQuestions, refs }) => {
    const result = requireStore().addEntry(project, topic, {
      status,
      nextStep,
      openQuestions,
      refs,
    })
    scheduleRefresh()
    return result
  })
  ctx.handle('done', ({ project, topic, note }) => {
    const result = requireStore().done(project, topic, note)
    scheduleRefresh()
    return result
  })
  ctx.handle('pins', () => requireStore().pins())
  ctx.handle('pin', ({ project, topic }) => {
    const result = requireStore().pin(project, topic)
    scheduleRefresh()
    return result
  })
  ctx.handle('unpin', ({ project, topic }) => {
    requireStore().unpin(project, topic)
    scheduleRefresh()
  })
  ctx.handle('dbInfo', () => {
    syncStore()
    return {
      path: location.path,
      pathSource: location.source,
      exists: fileIdentity(location.path) !== null,
      entries: store ? store.count() : 0,
    }
  })

  const stopSettings = ctx.settings.onChange((next, previous) => {
    if (next.dbPath !== previous.dbPath) refresh()
  })
  const stopSchedule = ctx.schedule(options.recheckMs ?? RECHECK_MS, refresh)

  ctx.log.info(`database path ${location.path} (${location.source})`)
  refresh()

  return () => {
    disposed = true
    clearTimeout(timer)
    stopSettings()
    stopSchedule()
    watcher?.close()
    watcher = null
    closeStore()
  }
}
