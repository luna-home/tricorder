/**
 * Runtime of the ports service: registers `list`, which reads the socket table on every call.
 * There is no background job: the renderer polls while the page is visible.
 */
import type { ServiceContext } from '@shared/define-service'

import type { PortsContract } from '../contract'
import { execRunner, isSupported, type Runner, scanPorts } from './scan'

export interface PortsRuntimeOptions {
  /** Defaults to `process.platform`. */
  platform?: NodeJS.Platform
  run?: Runner
}

export function startPorts(
  ctx: ServiceContext<PortsContract>,
  options: PortsRuntimeOptions = {},
): void {
  const platform = options.platform ?? process.platform
  const run = options.run ?? execRunner
  ctx.handle('list', () => scanPorts(platform, run))
  // Without a status from setup the host sets the service online.
  if (!isSupported(platform))
    ctx.status.set('unconfigured', { code: 'unsupported', detail: platform })
}
