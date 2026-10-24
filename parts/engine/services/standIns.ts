import type { Opened } from '../opened.ts'

// The stand-ins of each app, by the name of the service or the model they stand in for, under its handles.
const held = new WeakMap<object, Map<string, object>>()

/** Puts a stand-in in place of a service or a model of an app. */
export function keepStandIn(o: Opened, name: string, stand: object): void {
  const mine = held.get(o.handles) ?? new Map<string, object>()
  mine.set(name, stand)
  held.set(o.handles, mine)
}

/** The stand-in that an app holds for a service or a model, where it holds one. */
export const standInOf = (o: Opened, name: string): object | undefined => held.get(o.handles)?.get(name)
