import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { getCurrentScope, onScopeDispose, toValue, type MaybeRefOrGetter } from 'vue'

import type { Unsubscribe } from '@shared/api'
import type {
  EventName,
  EventPayload,
  MethodInput,
  MethodName,
  MethodResult,
} from '@shared/contract'
import type { ContractOf, ServiceId } from '@services/registry'

import { callService, createServiceClient, getBridge, serviceQueryKey } from './client'

export interface ServiceQueryOptions {
  /** The query only runs while this is true. */
  enabled?: MaybeRefOrGetter<boolean>
}

/**
 * Typed access to one service from a component's setup:
 * - `api`: one async function per contract method.
 * - `on(event, fn)`: event subscription, removed automatically when the scope is disposed.
 * - `query(method, args)`: TanStack query under `['svc', id, method, args]`; `args` may be a ref
 *   or getter. Every event of the service invalidates all its queries (see `useServiceEventSync`).
 * - `mutation(method)`: TanStack mutation that invalidates the service's queries on success.
 */
export function useService<Id extends ServiceId>(id: Id) {
  type C = ContractOf<Id>
  const api = createServiceClient(id)
  const queryClient = useQueryClient()

  function on<E extends EventName<C>>(
    event: E,
    listener: (data: EventPayload<C, E>) => void,
  ): Unsubscribe {
    const bridge = getBridge()
    if (!bridge) return () => {}
    const off = bridge.on(id, event, listener)
    if (getCurrentScope()) onScopeDispose(off)
    return off
  }

  function query<M extends MethodName<C>>(
    method: M,
    args?: MaybeRefOrGetter<MethodInput<C, M>>,
    options: ServiceQueryOptions = {},
  ) {
    return useQuery(() => {
      const input = toValue(args)
      return {
        queryKey: serviceQueryKey(id, method, input),
        queryFn: () => callService(id, method, input) as Promise<MethodResult<C, M>>,
        enabled: toValue(options.enabled) ?? true,
      }
    })
  }

  function mutation<M extends MethodName<C>>(method: M) {
    return useMutation({
      mutationFn: (input: MethodInput<C, M>) =>
        callService(id, method, input) as Promise<MethodResult<C, M>>,
      onSuccess: () => invalidate(),
    })
  }

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: serviceQueryKey(id) })
  }

  return { id, api, on, query, mutation, invalidate }
}
