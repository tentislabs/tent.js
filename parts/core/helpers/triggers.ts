import type { Events } from '../lists.ts'
import { mark } from '../mark.ts'
import type { Trigger } from '../plan.ts'
import type { Handed, Type } from '../type.ts'

/** Takes a schedule in words, as `'day at 09:00'` or `'15 minutes'`. Answers the trigger that fires by it. */
export function every(schedule: string): Trigger<{ kind: 'time'; at: Date }> {
  return mark({ every: schedule })
}

/** Takes a schedule in the five fields of cron, and the zone it is read in. Answers the trigger that fires by it. */
export function cron(schedule: string, o?: { zone?: string }): Trigger<{ kind: 'time'; at: Date }> {
  return mark(o?.zone === undefined ? { cron: schedule } : { cron: schedule, zone: o.zone })
}

/**
 * What `event` may be handed beside the name: in `stopOn` of a flow, the key of the runs it stops, over its data;
 * in `on`, the values that its data must hold for the flow to start.
 */
interface EventOptions {
  key?: (o: { data: unknown }) => unknown
  where?: Record<string, unknown>
}

/** An event that a definition file declares: a trigger whose data has the shape that `data` gives it. */
export type Declared<Name extends string, Data> = Trigger<{ kind: 'event'; name: Name; data: Data }> & {
  readonly event: Name
  readonly data: Type
}

/** The data of a declared event, as a change emits it and a flow is handed it. */
export type DataOf<D> = D extends Trigger<{ data: infer Data }> ? Data : unknown

/**
 * Takes the name of an event, and in `stopOn` the key it stops by, in `on` what its data must hold. Answers the
 * trigger that fires when a change emits it, which a wait may take too. With `data` it declares the event: `emit`
 * holds its data to that type, and every `on` and `waitFor` of it is handed that type.
 */
export function event<const Name extends string, const Data extends Type>(
  name: Name,
  o: { data: Data },
): Declared<Name, Handed<Data>>
export function event<const Name extends Extract<keyof Events, string>>(
  name: Name,
  o?: EventOptions,
): Trigger<{ kind: 'event'; name: Name; data: Events[Name] }>
export function event<const Name extends string>(
  name: Name extends keyof Events ? never : Name,
  o?: EventOptions,
): Trigger<{ kind: 'event'; name: Name; data: unknown }>
export function event(name: string, o?: EventOptions & { data?: Type }): object {
  return mark({
    event: name,
    ...(o?.key === undefined ? {} : { key: o.key }),
    ...(o?.where === undefined ? {} : { where: o.where }),
    ...(o?.data === undefined ? {} : { data: o.data }),
  })
}
