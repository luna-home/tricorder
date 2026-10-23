import { join } from 'node:path'

import { app, BrowserWindow, dialog, ipcMain, Notification, safeStorage } from 'electron'

import { DEFAULT_LOCALE, type Locale, pickLocale } from '@shared/locale'

import trayIcon from './assets/tray.png?asset'
import trayIcon2x from './assets/tray@2x.png?asset'
import trayTemplate from './assets/trayTemplate.png?asset'
import trayTemplate2x from './assets/trayTemplate@2x.png?asset'
import { applyLoginItem, setupAppSettings } from './app-settings'
import { type AppEnv, parseEnv } from './app-env'
import { MAIN_MESSAGES } from './i18n'
import { createLoggerFactory } from './logger'
import { HIDDEN_ARG, resolveUserData, startedHidden } from './paths'
import { SecretStore } from './secret-store'
import { ServiceHost } from './service-host'
import { serviceNames, serviceSources } from './services'
import { SettingsStore } from './settings-store'
import { createTray } from './tray'
import { isAppUrl } from './urls'
import { createMainWindow, hardenSessions, rendererUrl } from './window'

// Fail fast on a bad environment, before anything (userData, logs, the DB path) depends on it.
const env = parseEnv(process.env)
if (!env.ok) {
  console.error(`[tricorder] invalid environment:\n${env.message}`)
  void app.whenReady().then(() => {
    dialog.showErrorBox(MAIN_MESSAGES[pickLocale(app.getLocale())].envInvalid, env.message)
    app.exit(1)
  })
} else {
  start(env.env)
}

function start(appEnv: AppEnv): void {
  // Must happen before `ready` and before the single-instance lock, which lives in userData.
  const userData = resolveUserData({
    env: appEnv,
    argv: process.argv,
    isPackaged: app.isPackaged,
    appData: app.getPath('appData'),
  })
  if (userData) app.setPath('userData', userData)

  // `electron-vite dev` kills and respawns Electron on every main rebuild; the new process would
  // lose the race for the lock. Dev has its own userData folder, so it goes without the lock.
  const devServer = !app.isPackaged && Boolean(process.env.ELECTRON_RENDERER_URL)
  if (!devServer && !app.requestSingleInstanceLock()) {
    app.quit()
  } else {
    run()
  }
}

function run(): void {
  const mac = process.platform === 'darwin'
  const logs = createLoggerFactory({
    dir: join(app.getPath('userData'), 'logs'),
    console: !app.isPackaged,
  })
  const log = logs('tricorder')

  let win: BrowserWindow | undefined
  let quitting = false
  let appUrl = ''
  // Decided once `ready` (app.getLocale needs it); tray, window and renderer all use it.
  let locale: Locale = DEFAULT_LOCALE

  const showWindow = () => {
    if (!win || win.isDestroyed()) {
      win = createMainWindow({
        appUrl,
        title: MAIN_MESSAGES[locale].title,
        locale,
        hideOnClose: () => !quitting,
      })
      return
    }
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  app.on('second-instance', showWindow)
  app.on('before-quit', () => {
    quitting = true
  })
  // The app lives on in the tray; quit only via the tray, Cmd+Q or the app menu.
  app.on('window-all-closed', () => {})

  void app
    .whenReady()
    .then(async () => {
      log.info(
        `main started (electron ${process.versions.electron}, userData ${app.getPath('userData')}, locale ${app.getLocale()})`,
      )
      locale = pickLocale(app.getLocale())
      appUrl = rendererUrl()
      hardenSessions(appUrl)

      const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'), log)
      const secrets = new SecretStore(
        join(app.getPath('userData'), 'secrets.json'),
        safeStorage,
        log,
      )

      const appSettings = setupAppSettings({
        ipc: ipcMain,
        store: settings,
        log,
        applyAutostart: (enabled) => {
          if (!app.isPackaged) {
            log.info(`autostart ${enabled ? 'on' : 'off'}: only applied in the packaged app`)
            return
          }
          const args = mac ? [] : [HIDDEN_ARG]
          applyLoginItem(
            {
              get: () => app.getLoginItemSettings({ args }),
              set: (openAtLogin) => app.setLoginItemSettings({ openAtLogin, args }),
            },
            enabled,
          )
        },
      })

      const host = new ServiceHost({
        ipc: ipcMain,
        broadcast: (channel, payload) => {
          for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) window.webContents.send(channel, payload)
          }
        },
        settings,
        secrets: (id) => secrets.forService(id),
        notify: (title, body) => {
          if (!Notification.isSupported()) return
          const notification = new Notification({ title, body })
          notification.on('click', showWindow)
          notification.show()
        },
        logger: logs,
        isTrustedSender: (event) => {
          const url = (event as Electron.IpcMainInvokeEvent).senderFrame?.url
          return url !== undefined && isAppUrl(url, appUrl)
        },
      })

      const tray = createTray({
        icon: mac
          ? { x1: trayTemplate, x2: trayTemplate2x, template: true }
          : { x1: trayIcon, x2: trayIcon2x, template: false },
        messages: MAIN_MESSAGES[locale],
        serviceName: serviceNames(locale),
        services: () => host.list(),
        open: showWindow,
        quit: () => app.quit(),
      })
      host.onStatus(() => tray.refresh())

      let stopped = false
      app.on('will-quit', (event) => {
        if (stopped) return
        event.preventDefault()
        void (async () => {
          try {
            await host.stop()
            appSettings.dispose()
            await Promise.all([settings.flush(), secrets.flush()])
          } catch (error) {
            log.error('shutdown failed', error)
          } finally {
            stopped = true
            tray.destroy()
            log.info('main stopped')
            // Not from a microtask: Electron ignores quit() until the prevented will-quit returned.
            setTimeout(() => app.quit(), 0)
          }
        })()
      })

      const hidden = startedHidden(
        process.argv,
        mac && app.getLoginItemSettings().wasOpenedAtLogin === true,
      )
      // Handlers are registered synchronously at the start of host.start(), before the window loads.
      const started = host.start(serviceSources())
      tray.refresh()
      if (!hidden) showWindow()
      app.on('activate', showWindow)
      await started
      tray.refresh()
    })
    .catch((error: unknown) => {
      log.error('start failed', error)
    })
}
