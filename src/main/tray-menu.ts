import type { ServiceInfo } from '@shared/service'

import type { MainMessages } from './i18n'

export type TrayItem =
  | { kind: 'action'; action: 'open' | 'quit'; label: string }
  | { kind: 'status'; label: string }
  | { kind: 'separator' }

/** Menu of the tray icon: Open, one status line per service, Quit. Pure, Electron-free. */
export function buildTrayMenu(
  services: ServiceInfo[],
  serviceName: (id: string) => string,
  t: MainMessages,
): TrayItem[] {
  const lines: TrayItem[] = services.length
    ? services.map((service) => ({ kind: 'status', label: statusLine(service, serviceName, t) }))
    : [{ kind: 'status', label: t.noServices }]
  return [
    { kind: 'action', action: 'open', label: t.open },
    { kind: 'separator' },
    ...lines,
    { kind: 'separator' },
    { kind: 'action', action: 'quit', label: t.quit },
  ]
}

export function statusLine(
  service: ServiceInfo,
  serviceName: (id: string) => string,
  t: MainMessages,
): string {
  return `${serviceName(service.id)} · ${t.state[service.status.state]}`
}

/** Tooltip: app name plus every service that needs attention. */
export function trayTooltip(
  services: ServiceInfo[],
  serviceName: (id: string) => string,
  t: MainMessages,
): string {
  const attention = services.filter((service) =>
    ['offline', 'unconfigured', 'error'].includes(service.status.state),
  )
  return [t.title, ...attention.map((service) => statusLine(service, serviceName, t))].join('\n')
}
