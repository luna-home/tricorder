/// <reference types="vite/client" />
/// <reference types="electron-vite/node" />

declare namespace NodeJS {
  interface ProcessEnv {
    /** Overrides the userData directory (settings, secrets, logs). Validated in `src/main/app-env.ts`. */
    readonly TRICORDER_USER_DATA?: string
    /** Logbuch database, overrides the setting `dbPath`. Validated in `src/main/app-env.ts`. */
    readonly LOGBUCH_DB?: string
  }
}
