/// <reference types="vite/client" />

import type { AppApi } from '@services/registry'

declare global {
  interface Window {
    /** Bridge to the main process, exposed by src/preload. */
    tricorder: AppApi
  }
}
