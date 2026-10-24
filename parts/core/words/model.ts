import type { Definition, Marker } from '../definition.ts'
import { callable, calls, record } from '../definition.ts'
import type { ServiceCall } from '../helpers/calls.ts'
import type { Secret } from '../helpers/references.ts'
import type { Handed, HandedFields, None, Type } from '../type.ts'
import type { Fields, InputArgs, Stated, Units } from './shared.ts'

/** The options of `model`. */
export interface ModelOptions<I, Out, Call> {
  provider: string
  name: string
  key?: Secret
  url?: string
  hosted?: readonly string[]
  abilities?: readonly string[]
  takes?: number
  voices?: readonly string[]
  input?: I
  output?: Out
  limits?: { perDay?: Units; perCallerPerDay?: Units; time?: string }
  tries?: number | { max: number; wait?: string }
  fallback?: readonly Marker[]
  options?: Record<string, unknown>
  countBy?: 'app'
  call?: Call
  units?: Record<string, string | number>
  job?: { check: Marker; with?: Record<string, string>; done: object; failed?: object; every?: string }
  was?: string | readonly string[]
}

/** What is handed each part of the model's own reasoning as it arrives, and `null` where the call begins anew. */
type Reasoning = (part: string | null) => void

/** A value as it grows: every field may not have come yet, at every depth. */
type Growing<T> = T extends readonly (infer Entry)[]
  ? Growing<Entry>[]
  : T extends object
    ? { [Name in keyof T]?: Growing<T[Name]> }
    : T

/** The value of a shape, as `fill` answers it. */
type Filled<Shape> = Shape extends Type ? Handed<Shape> : HandedFields<Shape>

/** A call of `stream`: its text as it arrives, and with a `shape` its value as it grows, beside the text so far. */
interface Stream {
  <Shape extends Type | Fields>(
    prompt: string,
    o: { shape: Shape; input?: unknown; images?: readonly string[]; reasoning?: Reasoning },
  ): AsyncIterable<{ value: Growing<Filled<Shape>>; text: string }>
  (prompt: string, o?: { input?: unknown; images?: readonly string[]; reasoning?: Reasoning }): AsyncIterable<string>
}

/** The seven fixed calls of a model. Which of them a model has is said by its abilities. */
interface ModelCalls {
  reply: ((
    prompt: string,
    o?: { input?: unknown; images?: readonly string[]; reasoning?: Reasoning },
  ) => Promise<string>) &
    Marker
  stream: Stream & Marker
  fill: (<Shape extends Type | Fields>(
    shape: Shape,
    prompt: string,
    o?: { input?: unknown; images?: readonly string[]; reasoning?: Reasoning },
  ) => Promise<Filled<Shape>>) &
    Marker
  embed: ((text: string) => Promise<number[]>) & ((texts: readonly string[]) => Promise<number[][]>) & Marker
  hear: ((
    file: string,
    o?: { language?: string; hint?: string },
  ) => Promise<{ text: string; language: string; seconds: number }>) &
    Marker
  speak: ((text: string, o?: { name?: string; format?: 'mp3' | 'wav' | 'opus'; speed?: number }) => Promise<string>) &
    Marker
  // How well each text fits the words: one score for each, higher where it fits better.
  rank: ((words: string, texts: readonly string[]) => Promise<number[]>) & Marker
}

/** A model as a function: it is one where it states what it takes and gives, or the call of a service that it is made of. */
type ModelFunction<I, Out, Call> =
  Call extends ServiceCall<infer CallInput, infer CallOutput>
    ? (...input: InputArgs<CallInput>) => Promise<CallOutput extends Type ? Stated<CallOutput> : unknown>
    : Out extends Type
      ? (...input: InputArgs<I>) => Promise<Stated<Out>>
      : unknown

/** What `model` returns: the seven fixed calls, and a function where the model states what it takes and gives. */
export type ModelDefinition<Name extends string, I, Out, Call> = Definition<'model', Name, ModelOptions<I, Out, Call>> &
  ModelCalls &
  ModelFunction<I, Out, Call>

const fixed = ['reply', 'stream', 'fill', 'embed', 'hear', 'speak', 'rank']

/**
 * Takes the name of a model and its options, of which `provider` and `name` are required. Answers the definition,
 * which only records them, with a marker for each of the seven fixed calls, whose call is handed to the runtime. A
 * model that states `input` and `output`, or the call of a service, is also a function.
 */
export function model<
  const Name extends string,
  const I extends Fields = None,
  const Out extends Type | undefined = undefined,
  Call = undefined,
>(name: Name, o: ModelOptions<I, Out, Call>): ModelDefinition<Name, I, Out, Call>
export function model(name: string, o: ModelOptions<unknown, unknown, unknown>): object {
  // What is no record of options has no call, and is refused where the definition is made.
  const isFunction = Object(o).call !== undefined || (Object(o).input !== undefined && Object(o).output !== undefined)
  const made = isFunction ? callable('model', name, o) : record('model', name, o)
  return Object.assign(made, Object.fromEntries(fixed.map((call) => [call, calls(`${name}.${call}`)])))
}
