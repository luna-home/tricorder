/**
 * The one locale decision of the app. Main picks it from the system locale and hands it to the
 * renderer (preload `locale`), so tray, dialogs and window always speak the same language.
 * Zod-free: the sandboxed preload imports this file.
 */
export const LOCALES = ['de', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/** Project default (frontend-stack): German unless the system asks for English. */
export const DEFAULT_LOCALE: Locale = 'de'

/** Command-line switch that carries the locale from main to the renderer's preload. */
export const LOCALE_ARG = '--tricorder-locale='

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** `en` for an English system locale (`en`, `en-US` ...), the default otherwise. */
export function pickLocale(systemLocale: string): Locale {
  return systemLocale.toLowerCase().startsWith('en') ? 'en' : DEFAULT_LOCALE
}

/** Locale from the renderer's command line (see {@link LOCALE_ARG}). */
export function localeFromArgv(argv: readonly string[]): Locale {
  const value = argv.find((arg) => arg.startsWith(LOCALE_ARG))?.slice(LOCALE_ARG.length)
  return isLocale(value) ? value : DEFAULT_LOCALE
}
