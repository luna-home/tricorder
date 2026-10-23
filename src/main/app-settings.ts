import { z } from 'zod'

import type { AppSettings } from '@shared/api'
import type { ServiceLogger } from '@shared/define-service'
import { HOST_CHANNELS } from '@shared/ipc'

import { errorMessage, fail, ok, type IpcRegistrar } from './service-host'
import { SettingsValidationError, ValidatedSection, type SettingsStore } from './settings-store'

export const appSettingsSchema = z.object({
  autostart: z.boolean().default(false),
}) satisfies z.ZodType<AppSettings, unknown>

/** The OS side of the autostart setting; `app.setLoginItemSettings` in production. */
export type ApplyAutostart = (enabled: boolean) => void

/** `app.getLoginItemSettings` / `setLoginItemSettings`, reduced to what autostart needs. */
export interface LoginItems {
  get(): { openAtLogin: boolean; status?: string }
  set(enabled: boolean): void
}

/**
 * Brings the OS login item to `enabled`. Leaves it alone when it already matches (macOS logs a
 * native error when an absent item is removed) and throws when the OS did not take the change,
 * because the OS call itself fails silently.
 */
export function applyLoginItem(items: LoginItems, enabled: boolean): void {
  if (items.get().openAtLogin === enabled) return
  items.set(enabled)
  const after = items.get()
  if (after.openAtLogin !== enabled) {
    const status = after.status ? ` (status ${after.status})` : ''
    throw new Error(`login item is still ${after.openAtLogin ? 'on' : 'off'}${status}`)
  }
}

/**
 * Settings of the app itself (`app` section of `settings.json`) with their IPC handlers. A change
 * is applied to the OS right away; on start the stored value is applied once, so the login item
 * follows the file even after it was edited by hand.
 */
export function setupAppSettings(deps: {
  ipc: IpcRegistrar
  store: SettingsStore
  log: ServiceLogger
  applyAutostart: ApplyAutostart
}): { settings: ValidatedSection<typeof appSettingsSchema>; dispose(): void } {
  const { ipc, store, log, applyAutostart } = deps
  const settings = new ValidatedSection(
    appSettingsSchema,
    store.app(),
    (value) => store.setApp(value),
    log,
  )

  const apply = (enabled: boolean) => {
    try {
      applyAutostart(enabled)
    } catch (error) {
      log.error('applying autostart failed', error)
    }
  }
  apply(settings.get().autostart)
  const off = settings.onChange((next, previous) => {
    if (next.autostart !== previous.autostart) apply(next.autostart)
  })

  ipc.handle(HOST_CHANNELS.appSettingsGet, () => ok(settings.get()))
  ipc.handle(HOST_CHANNELS.appSettingsSet, async (_event, patch) => {
    try {
      return ok(await settings.set(patch))
    } catch (error) {
      if (error instanceof SettingsValidationError) return fail('invalid-input', error.message)
      log.error('saving app settings failed', error)
      return fail('failed', errorMessage(error))
    }
  })

  return {
    settings,
    dispose() {
      off()
      ipc.removeHandler(HOST_CHANNELS.appSettingsGet)
      ipc.removeHandler(HOST_CHANNELS.appSettingsSet)
    },
  }
}
