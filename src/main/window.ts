import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { app, BrowserWindow, session, shell, type WebContents } from 'electron'

import tokens from '../renderer/design/luna-console/tokens.json'

import { LOCALE_ARG, type Locale } from '@shared/locale'

import { isAppUrl, isExternalUrl } from './urls'

/** Same policy as the meta tag in `src/renderer/index.html`, also sent as a header. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const ground = tokens.color.tokens.find((token) => token.name === 'color-lcars-ground')?.value

/** Where the renderer lives: the Vite dev server (hot reload) or the built `index.html`. */
export function rendererUrl(): string {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) return devUrl
  return pathToFileURL(join(__dirname, '../renderer/index.html')).href
}

/**
 * App-wide guards, call once before the first window: CSP header, no permissions, no webviews,
 * no navigation away from the app, external links in the system browser.
 */
export function hardenSessions(appUrl: string): void {
  const ses = session.defaultSession
  ses.webRequest.onHeadersReceived((details, callback) => {
    if (!isAppUrl(details.url, appUrl))
      return callback({ responseHeaders: details.responseHeaders })
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
      },
    })
  })
  ses.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(permission === 'clipboard-sanitized-write'),
  )

  app.on('web-contents-created', (_event, contents) => guardContents(contents, appUrl))
}

function guardContents(contents: WebContents, appUrl: string): void {
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  const blockNavigation = (event: { preventDefault(): void }, url: string) => {
    if (isAppUrl(url, appUrl)) return
    event.preventDefault()
    if (isExternalUrl(url)) void shell.openExternal(url)
  }
  contents.on('will-navigate', (event) => blockNavigation(event, event.url))
  contents.on('will-redirect', (event) => blockNavigation(event, event.url))
}

export interface MainWindowOptions {
  appUrl: string
  /** Window title, from the main messages. */
  title: string
  /** Handed to the renderer, see `@shared/locale`. */
  locale: Locale
  /** Called on "close": return true to only hide the window (the app stays in the tray). */
  hideOnClose(): boolean
}

export function createMainWindow({
  appUrl,
  title,
  locale,
  hideOnClose,
}: MainWindowOptions): BrowserWindow {
  const mac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 560,
    minHeight: 400,
    show: false,
    title,
    backgroundColor: ground,
    // macOS: the LCARS frame fills the whole window, the traffic lights sit on top of it.
    ...(mac ? { titleBarStyle: 'hiddenInset' as const } : {}),
    autoHideMenuBar: !mac,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      additionalArguments: [`${LOCALE_ARG}${locale}`],
    },
  })

  win.once('ready-to-show', () => win.show())
  win.on('close', (event) => {
    if (!hideOnClose()) return
    event.preventDefault()
    win.hide()
  })

  const { webContents } = win
  webContents.on('did-finish-load', () => console.log('[tricorder] window loaded'))
  webContents.on('did-fail-load', (_event, code, description, url) =>
    console.error(`[tricorder] window failed to load ${url}: ${code} ${description}`),
  )
  webContents.on('render-process-gone', (_event, details) =>
    console.error(`[tricorder] renderer gone: ${details.reason} (${details.exitCode})`),
  )
  if (app.isPackaged || !process.env.ELECTRON_RENDERER_URL) {
    // In dev the Vite server forwards renderer console output (server.forwardConsole).
    webContents.on('console-message', ({ level, message, sourceId, lineNumber }) => {
      if (level === 'error') console.error(`[renderer] ${message} (${sourceId}:${lineNumber})`)
    })
  }

  void win.loadURL(appUrl)
  return win
}
