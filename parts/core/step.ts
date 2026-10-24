import type { Marker } from './definition.ts'
import type { PlanBuilder, Trigger } from './plan.ts'

/** A value as a step saves it: plain data, in which a moment is text in the standard form. */
type Saved<Value> = Value extends Date
  ? string
  : Value extends readonly (infer Entry)[]
    ? Saved<Entry>[]
    : Value extends object
      ? { [Key in keyof Value]: Saved<Value[Key]> }
      : Value

/** What a step may state beside its name and its work. */
interface StepOptions {
  tries?: number | { max: number; wait?: string }
  background?: boolean | 'here'
  worker?: string
  time?: string
  reserve?: string
  remember?: true | { key: readonly unknown[]; for?: string; kind?: boolean; version?: string; shared?: string }
  rows?: Record<string, PlanBuilder<never, unknown, unknown>>
  uses?: readonly Marker[]
  // What the step saves is sealed with the key of the secrets, and opened only when its run reads it back.
  sealed?: true
}

/** What a step that goes on past its failure answers, once its tries are used up. */
interface Failed {
  failed: true
  code: string
  message: string
}

/** What a wait for a person or for an event answers. */
interface Waited {
  approved?: boolean
  data?: unknown
  timedOut?: true
}

/**
 * What the work of a step is handed: the rows that travel with it, what keeps and reads where it has come, whether
 * its machine stops, what hands it back, and `say`, which tells whoever follows its run a value.
 */
interface StepHanded {
  rows: Record<string, unknown>
  progress(): unknown
  progress(value: unknown): Promise<void>
  stopping(): boolean
  back(): never
  say(value: unknown): void
}

/** The step tools, which the `run` of a flow is handed as `step`. */
export interface Step {
  // A step that states `onFail: 'goOn'` answers its failure in place of refusing, so `r.failed` reads on both.
  <Result>(
    name: string,
    work: (handed: StepHanded) => Result | Promise<Result>,
    o: StepOptions & { onFail: 'goOn' },
  ): Promise<(Saved<Result> & { failed?: undefined }) | Failed>
  <Result>(
    name: string,
    work: (handed: StepHanded) => Result | Promise<Result>,
    o?: StepOptions,
  ): Promise<Saved<Result>>
  wait(until: string | Date, o?: { name?: string }): Promise<void>
  // A wait for an event is handed the type of its data, where the event is declared.
  waitFor<Data>(
    what: Trigger<{ kind: 'event'; data: Data }>,
    o?: { where?: object; timeout?: string; name?: string },
  ): Promise<{ data?: Data; timedOut?: true }>
  waitFor(what: string | object, o?: { where?: object; timeout?: string; name?: string }): Promise<Waited>
  all<Result>(works: readonly (() => Promise<Result>)[]): Promise<Result[]>
  all<Entry, Result>(list: readonly Entry[], work: (entry: Entry, i: number) => Promise<Result>): Promise<Result[]>
  first<Result>(works: readonly (() => Promise<Result>)[]): Promise<Result>
  first<Entry, Result>(list: readonly Entry[], work: (entry: Entry, i: number) => Promise<Result>): Promise<Result>
  many(
    name: string,
    entries: readonly unknown[] | PlanBuilder<never, unknown, unknown>,
    flow: Marker,
    o?: { chunk?: number; atOnce?: number; mayFail?: string | number },
  ): Promise<{ entries: number; done: number; failed: number }>
  // Each is saved as a step of its name, and handed at once.
  now(): Date
  random(): number
  done(value?: unknown): Promise<never>
  // Ends the run as done and starts a new run of the flow with this input, its key and its starter, in the same write.
  again(input?: unknown): Promise<never>
}
