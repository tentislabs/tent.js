import type { Opened } from './opened.ts'

/**
 * Where an engine takes the parts that are fetched at their first use, where the program that started it says so:
 * `from` is an address of the builder's own that serves every part, and `folder` stands in the place of the
 * runner's folder, in whose `fetched/` the parts lie.
 */
export interface PartsFrom {
  from?: string
  folder?: string
}

// What the engine of each app was told of its parts, kept under the handles of the app.
const kept = new WeakMap<object, PartsFrom>()

/** Is told at the opening of an app where its engine takes its parts. */
export const keepParts = (o: Opened, parts: PartsFrom): void => void kept.set(o.handles, parts)

/** Answers where the engine of an app takes its parts, or nothing for an app whose engine was told nothing. */
export const partsOf = (o: Opened | undefined): PartsFrom => (o ? (kept.get(o.handles) ?? {}) : {})
