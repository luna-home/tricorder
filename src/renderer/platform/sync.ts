import { useQueryClient } from '@tanstack/vue-query'
import { onScopeDispose, watch } from 'vue'

import type { TricorderBridge } from '@shared/api'
import { registry } from '@services/registry'

import { getBridge, serviceQueryKey } from './client'
import { useServicesStore } from './status'

/**
 * Keeps TanStack Query in step with the services: every event of a service, and every status
 * change back to `online`, invalidates all queries of that service. Call once, in the app root.
 */
export function useServiceEventSync() {
  const queryClient = useQueryClient()
  const store = useServicesStore()
  const bridge = getBridge() as TricorderBridge | undefined

  const invalidate = (id: string) =>
    void queryClient.invalidateQueries({ queryKey: serviceQueryKey(id) })

  const offs = bridge
    ? Object.values(registry).flatMap(({ manifest, contract }) =>
        Object.keys(contract.events).map((event) =>
          bridge.on(manifest.id, event, () => invalidate(manifest.id)),
        ),
      )
    : []
  onScopeDispose(() => offs.forEach((off) => off()))

  watch(
    () => store.services.map(({ id, status }) => `${id}:${status.state}`),
    (next, previous) => {
      for (const entry of next) {
        if (entry.endsWith(':online') && !previous?.includes(entry)) {
          invalidate(entry.slice(0, -':online'.length))
        }
      }
    },
  )
}
