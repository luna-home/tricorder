/**
 * Plain service metadata: manifest, status and the service list the renderer shows.
 * Free of runtime dependencies, so main, preload and renderer can all import it.
 */
import type { LcColor } from '../renderer/design/luna-console/vue/types'

export type { LcColor }

/**
 * How a service works:
 * - `local`: a tool on this machine (e.g. logbuch, a SQLite file).
 * - `remote`: access to a Luna Home system (MQTT, Home Assistant, ...).
 * - `background`: mainly runs scheduled jobs while the window is closed.
 */
export type ServiceKind = 'local' | 'remote' | 'background'

/** Lower-case id: letters, digits and dashes, starting with a letter. Used in IPC channels and routes. */
export const SERVICE_ID_PATTERN = /^[a-z][a-z0-9-]*$/

/** Static description of a built-in service. Lives in `src/services/<id>/manifest.ts`. */
export interface ServiceManifest<Id extends string = string> {
  /** Unique id, matches the folder name `src/services/<id>/` and {@link SERVICE_ID_PATTERN}. */
  id: Id
  /** vue-i18n key of the display name, by convention `services.<id>.name`. */
  nameKey: string
  /** Luna Console colour of the service (rail button, start tile). */
  color: LcColor
  kind: ServiceKind
  /** Sort key for rail and start page, ascending. */
  order: number
}

/**
 * Runtime state of a service, set by the service through `ctx.status.set()`.
 * - `starting`: set by the host until `setup()` has finished.
 * - `online`: working.
 * - `offline`: the remote side is unreachable (red alert in the UI).
 * - `unconfigured`: settings missing or invalid, the user has to act (yellow alert).
 * - `error`: the service failed, e.g. `setup()` threw (red alert).
 */
export type ServiceState = 'starting' | 'online' | 'offline' | 'unconfigured' | 'error'

/** States a service may set itself; `starting` belongs to the host. */
export type SettableServiceState = Exclude<ServiceState, 'starting'>

/**
 * Why a service is in its state. The main process writes no user-visible prose: the renderer
 * translates `code` and shows `detail` verbatim (it keeps its case, e.g. a path).
 */
export interface StatusReason {
  /** Looked up as `services.<id>.reasons.<code>`, then `reasons.<code>` (camelCase). */
  code: string
  /** Technical detail: a path, an error message. Never translated. */
  detail?: string
}

export interface ServiceStatus {
  id: string
  state: ServiceState
  reason?: StatusReason
  /** ISO 8601 time of the last state change. */
  since: string
}

/** One row of `window.tricorder.services.list()`: manifest plus current status. */
export interface ServiceInfo extends ServiceManifest {
  status: ServiceStatus
}
