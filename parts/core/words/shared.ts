import type { User } from '../caller.ts'
import type { Marker } from '../definition.ts'
import type { PlanBuilder } from '../plan.ts'
import type { Given, GivenFields, Handed, Type } from '../type.ts'

/** The fields of an input, each a type by its name. */
export type Fields = { readonly [name: string]: Type }

/** The doors a function, a flow, an agent and a screen may be offered to. */
export type Offer = 'api' | 'mcp' | 'cli'

/** A list of definitions, each handed on as it was imported or by its name. */
export type Names = readonly (string | Marker)[]

/** The arguments of a call that takes one input: the input may be left out where none of its fields is required. */
export type InputArgs<I> =
  Record<never, never> extends GivenFields<I> ? [input?: GivenFields<I>] : [input: GivenFields<I>]

/** What a function with a stated output answers, and nothing where it states none. */
export type Stated<Out> = Out extends Type ? Handed<Out> : undefined

/** What the `run` of a function with a stated output may answer. */
export type Result<Out> = Out extends Type ? Given<Out> : unknown

/** A value, or a promise of it. */
export type Awaitable<Value> = Value | Promise<Value>

/** `call`, which a function and a route that states `system` is handed: it calls a function as the system. */
export type SystemCall = <Args extends unknown[], Answer>(
  fn: ((...args: Args) => Answer) & Marker,
  ...input: Args
) => Answer

/** A record of units, each with the most of it for a day or for a run. */
export type Units = Record<string, number>

/** What the type checker says of a `run` that answers a promise where the function must answer at once. */
export type AtOnce<R> =
  R extends PromiseLike<unknown> ? { run: 'this run answers at once, and may not be async' } : unknown

/** The options of heavy work, which an action and a `python` take. */
export interface HeavyOptions {
  background?: boolean | 'here'
  worker?: string
  batch?: { max: number; wait?: string; measure?: string; split?: boolean }
  remember?: true | { for?: string; kind?: boolean; version?: string; shared?: string }
  rows?: Record<string, PlanBuilder<never, unknown, unknown>>
  uses?: readonly Marker[]
  changes?: false
  callerGone?: 'goOn' | 'stop'
}

/** What heavy work is handed beside the input: how each of these works is the engine's to say. */
export interface HeavyHanded {
  rows: Record<string, unknown[]>
  progress: (...said: unknown[]) => void
  stopping: unknown
  back: (...kept: unknown[]) => unknown
  say: (...said: unknown[]) => void
  entries: readonly { input: unknown; user: User | undefined; db: unknown; rows: unknown; about: unknown }[]
}
