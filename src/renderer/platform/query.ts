import { QueryClient } from '@tanstack/vue-query'

import { isPermanentError } from './client'

/**
 * Query client of the app. Service data is local IPC: one quick retry for handler failures,
 * none for permanent errors. Events invalidate queries, so data stays fresh without polling.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failures, error) => !isPermanentError(error) && failures < 1,
        staleTime: 30_000,
      },
      mutations: { retry: false },
    },
  })
}
