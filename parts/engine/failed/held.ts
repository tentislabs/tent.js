import type { Opened } from '../opened.ts'
import type { Failure } from './failure.ts'

// The failures that the open pages of an app in development show, by its data folder, which every version of it
// shares. A save that switches to a new version takes them away.
const held = new Map<string, Failure[]>()

// How many failures are shown at most: the newest stand.
const most = 20

/** The failures that the open pages of an app show now. */
const failuresOf = (o: Opened): Failure[] => held.get(o.dataFolder) ?? []

/** What the open pages of an app in development show as an overlay: what was found of the project, and every failure. */
export const failuresShown = (o: Opened): object[] => [...(o.findings ?? []), ...failuresOf(o)]

/** Takes the failures of an app away: the version they came from runs no more. */
export function forgetFailures(o: Opened): void {
  held.delete(o.dataFolder)
}

/** Shows a failure on every open page, once: the same words at the same place stand once, as the newest. */
export function keepFailure(o: Opened, failure: Failure): void {
  const key = JSON.stringify([failure.message, failure.where])
  const kept = failuresOf(o).filter((one) => JSON.stringify([one.message, one.where]) !== key)
  held.set(o.dataFolder, [...kept, failure].slice(-most))
  o.hub?.show(failuresShown(o))
}
