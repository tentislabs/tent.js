import type { Opened } from './opened.ts'
import type { Called } from './rooms/room.ts'

// The arrows of each loaded version, kept under the arrows of its rules: every record that the engine holds of
// one version shares those, and a switch hands them on with the version.
const kept = new WeakMap<object, Map<string, Called>>()

/**
 * Takes what the engine holds of an app whose code was just loaded, and what its room answered for each arrow that
 * the project itself states as code, under the name of its option: `identify`, `onRequest`, and the rules
 * `uploads` and `describeTo` where they are written with `allow`. Keeps them for the version.
 */
export function keepProjectCode(o: Opened, arrows: Map<string, Called>): void {
  kept.set(o.allows, arrows)
}

/** Answers the arrow that the project of the running version states under an option, or nothing where it states none as code. */
export const projectCode = (o: Opened, option: string): Called | undefined => kept.get(o.allows)?.get(option)
