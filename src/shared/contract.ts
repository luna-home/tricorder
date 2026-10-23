/**
 * Service contracts: the Zod schemas of a service's methods, events and settings, plus the
 * types derived from them. A contract lives in `src/services/<id>/contract.ts` and is imported
 * by both sides: the host validates every call against it in the main process, and the
 * renderer derives its typed client from it.
 *
 * Direction of the types, for a method with input schema `I` and output schema `O`:
 * - the caller passes `z.input<I>`, the handler receives `z.output<I>` (after trim, defaults ...)
 * - the handler returns `z.input<O>`, the caller receives `z.output<O>`
 */
import { z } from 'zod'

export interface MethodSpec<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  /** Arguments. Use `z.void()` for methods without arguments. */
  input: I
  output: O
}

export type MethodSpecs = Record<string, MethodSpec>
/** Event name -> payload schema. Use `z.void()` for events without payload. */
export type EventSpecs = Record<string, z.ZodType>
/** Settings of one service. Must parse `{}`: every field needs a default or `.optional()`. */
export type SettingsSpec = z.ZodObject

export interface ServiceContract<
  M extends MethodSpecs = MethodSpecs,
  E extends EventSpecs = EventSpecs,
  S extends SettingsSpec = SettingsSpec,
> {
  methods: M
  events: E
  settings: S
}

/**
 * Declares a service contract. `events` and `settings` are optional and default to none.
 *
 * @example
 * export const pingContract = defineContract({
 *   methods: { ping: { input: z.object({ text: z.string().trim() }), output: z.string() } },
 *   events: { pinged: z.void() },
 *   settings: z.object({ greeting: z.string().default('PONG') }),
 * })
 */
export function defineContract<
  const M extends MethodSpecs,
  const E extends EventSpecs = Record<never, never>,
  S extends SettingsSpec = z.ZodObject<Record<never, never>>,
>(contract: { methods: M; events?: E; settings?: S }): ServiceContract<M, E, S> {
  return {
    methods: contract.methods,
    events: contract.events ?? ({} as E),
    settings: contract.settings ?? (z.object({}) as unknown as S),
  }
}

export type MethodName<C extends ServiceContract> = keyof C['methods'] & string
export type EventName<C extends ServiceContract> = keyof C['events'] & string

/** What a caller passes to a method. */
export type MethodInput<C extends ServiceContract, K extends MethodName<C>> = z.input<
  C['methods'][K]['input']
>
/** What the handler receives, after the host parsed the input. */
export type MethodParams<C extends ServiceContract, K extends MethodName<C>> = z.output<
  C['methods'][K]['input']
>
/** What the handler returns, before the host parses it with the output schema. */
export type MethodReturn<C extends ServiceContract, K extends MethodName<C>> = z.input<
  C['methods'][K]['output']
>
/** What a caller receives. */
export type MethodResult<C extends ServiceContract, K extends MethodName<C>> = z.output<
  C['methods'][K]['output']
>

/** What the service passes to `ctx.emit()`. */
export type EventData<C extends ServiceContract, K extends EventName<C>> = z.input<C['events'][K]>
/** What a renderer listener receives. */
export type EventPayload<C extends ServiceContract, K extends EventName<C>> = z.output<
  C['events'][K]
>

export type SettingsOf<C extends ServiceContract> = z.output<C['settings']>
export type SettingsPatch<C extends ServiceContract> = Partial<z.input<C['settings']>>

/** Argument tuple that is optional when the schema accepts `undefined` (e.g. `z.void()`). */
export type ArgsFor<T> = undefined extends T ? [args?: T] : [args: T]

/** Typed renderer client of one service: one async function per method. */
export type ServiceClient<C extends ServiceContract> = {
  [K in MethodName<C>]: (...args: ArgsFor<MethodInput<C, K>>) => Promise<MethodResult<C, K>>
}
