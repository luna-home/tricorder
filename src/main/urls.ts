/** URL checks for navigation guards and IPC sender checks. Pure, Electron-free. */

function parse(url: string): URL | undefined {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

/**
 * True when `url` belongs to the app itself: same origin as the dev server, or the built
 * `index.html` (any hash or query) when the app is loaded from a file.
 */
export function isAppUrl(url: string, appUrl: string): boolean {
  const target = parse(url)
  const app = parse(appUrl)
  if (!target || !app) return false
  if (app.protocol === 'file:') {
    return target.protocol === 'file:' && target.pathname === app.pathname
  }
  return target.origin === app.origin
}

/** Links that may open in the system browser. */
export function isExternalUrl(url: string): boolean {
  const target = parse(url)
  return target?.protocol === 'https:' || target?.protocol === 'http:'
}
