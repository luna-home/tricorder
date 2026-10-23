import type { Locale } from '@shared/locale'
import type { ServiceState } from '@shared/service'

import de from '../renderer/locales/de.json'
import en from '../renderer/locales/en.json'

/**
 * The few texts of the main process (tray, window title, dialogs). They come from the renderer's
 * locale files, so tray and window use the same words for the same thing.
 */
export interface MainMessages {
  title: string
  open: string
  quit: string
  noServices: string
  state: Record<ServiceState, string>
  envInvalid: string
}

type RendererMessages = typeof de

function mainMessages(messages: RendererMessages): MainMessages {
  return {
    title: messages.app.title,
    open: messages.tray.open,
    quit: messages.tray.quit,
    noServices: messages.tray.noServices,
    state: messages.serviceState,
    envInvalid: messages.startup.envInvalid,
  }
}

export const MAIN_MESSAGES: Record<Locale, MainMessages> = {
  de: mainMessages(de),
  en: mainMessages(en),
}
