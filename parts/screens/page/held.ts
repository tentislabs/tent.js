// Every part of the page code, by the one list of them, which a page in a browser loads only when it needs it. A
// server holds them all before it draws: it draws whatever screen it is asked for, and what it holds costs no visitor.
import { loaders } from './loaders.ts'

let held: Promise<unknown> | undefined

/** Loads every part of the page code once. Answers when the server holds them all. */
export function allParts(): Promise<unknown> {
  held ??= Promise.all(Object.values(loaders).map((load) => load()))
  return held
}
