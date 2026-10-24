import type { McpStream } from '../../connect/index.ts'
import type { Opened } from '../opened.ts'

/** A kept stream of a caller, with the requests to its client that wait for their answer, by their ids. */
export interface KeptMcp {
  who: string
  stream: McpStream
  waiting: Map<string, { done(value: unknown): void; fail(error: unknown): void }>
}

// The kept streams of each app, which live in the memory of the engine alone.
const held = new WeakMap<Opened, Set<KeptMcp>>()

/** The kept streams of an app: made with the first, and closed with the app, before its data. */
export function keptOf(o: Opened): Set<KeptMcp> {
  const made = held.get(o)
  if (made) return made
  const all = new Set<KeptMcp>()
  held.set(o, all)
  o.before.push({ close: () => [...all].map((one) => one.stream.close()) })
  return all
}

/** How many kept streams of an app are open: like a live connection, each keeps the app in use. */
export const streamsOpen = (o: Opened): number => held.get(o)?.size ?? 0

/** Tells each kept stream of an app that the list of tools changed: a new version went live. */
export function toolsChanged(o: Opened): void {
  for (const one of held.get(o) ?? []) one.stream.changed()
}

/** Closes the kept streams of one caller, as those of a grant that ended. */
export function streamsEnded(o: Opened, who: string): void {
  for (const one of [...(held.get(o) ?? [])]) if (one.who === who) one.stream.close()
}
