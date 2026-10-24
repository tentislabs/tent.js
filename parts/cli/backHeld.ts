import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { checkDescription } from '../core/internal.ts'
import type { App } from '../engine/index.ts'
import type { History } from '../history/index.ts'

const isDescription = (value: unknown): value is Description => checkDescription(value).length === 0

/** The description that a point was kept with, or nothing for one that did not build. */
function describedBy(history: History, word: string): Description | undefined {
  const point = history.find(word)
  const bytes = point?.description === undefined ? undefined : history.blob(point.description)
  if (!bytes) return undefined
  const read: unknown = JSON.parse(new TextDecoder().decode(bytes))
  return isDescription(read) ? read : undefined
}

/**
 * Takes the history, the app that runs, and a word that names a point. Throws, before anything is changed, where
 * the data of the app cannot follow the files of that point: the finding of the table change, T2001 to T2004, with
 * the point named. A point that was kept with no description is not held here: its files are built first.
 */
export async function heldBack(history: History, app: App, word: string): Promise<void> {
  const described = describedBy(history, word)
  if (!described) return
  const found = (await app.facts(described, { back: true })).tableFindings
  const [first] = found
  if (!first) return
  throw new TentError(
    first.code,
    `Going back to ${word} changes no file, since the data cannot follow it: ${found.map((one) => one.message).join(' ')}`,
    { fix: first.fix ?? 'Change the rows that do not fit, or go back to another point.' },
  )
}
