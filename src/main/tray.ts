import {
  Menu,
  nativeImage,
  Tray,
  type MenuItemConstructorOptions,
  type NativeImage,
} from 'electron'
import { readFileSync } from 'node:fs'

import type { ServiceInfo } from '@shared/service'

import type { MainMessages } from './i18n'
import { buildTrayMenu, trayTooltip } from './tray-menu'

export interface TrayIconFiles {
  /** 1x and 2x PNG. */
  x1: string
  x2: string
  /** macOS template image: black + alpha, the system tints it for light and dark menu bars. */
  template: boolean
}

export interface TrayOptions {
  icon: TrayIconFiles
  messages: MainMessages
  serviceName(id: string): string
  services(): ServiceInfo[]
  open(): void
  quit(): void
}

function loadIcon({ x1, x2, template }: TrayIconFiles): NativeImage {
  const image = nativeImage.createFromBuffer(readFileSync(x1), { scaleFactor: 1 })
  image.addRepresentation({ scaleFactor: 2, buffer: readFileSync(x2) })
  if (template) image.setTemplateImage(true)
  return image
}

/**
 * Menu bar (macOS) / notification area (Windows) icon. `refresh()` rebuilds menu and tooltip,
 * call it on every status change.
 */
export function createTray(options: TrayOptions): { refresh(): void; destroy(): void } {
  const tray = new Tray(loadIcon(options.icon))

  const refresh = () => {
    const services = options.services()
    const template = buildTrayMenu(services, options.serviceName, options.messages).map(
      (item): MenuItemConstructorOptions => {
        if (item.kind === 'separator') return { type: 'separator' }
        if (item.kind === 'status') return { label: item.label, enabled: false }
        return {
          label: item.label,
          click: item.action === 'open' ? options.open : options.quit,
        }
      },
    )
    tray.setContextMenu(Menu.buildFromTemplate(template))
    tray.setToolTip(trayTooltip(services, options.serviceName, options.messages))
  }

  // Windows: a left click opens the window, the menu sits on the right click.
  if (process.platform !== 'darwin') tray.on('click', options.open)
  refresh()

  return {
    refresh,
    destroy: () => tray.destroy(),
  }
}
