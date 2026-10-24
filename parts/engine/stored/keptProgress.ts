// What a call of a `python` keeps of where it is, as a store or a task holds it: read where its row goes too, so it
// lies among the stored forms and loads nothing of Python.
import { isStored } from '../../core/internal.ts'

/** What is kept: the value as Python saved it, and the stored file of each path of the folder of its call it named. */
export interface ProgressKept {
  value: unknown
  files: Record<string, string>
}

/** The kept form of what a store or a task holds, or nothing where nothing was kept. */
export function progressKeptOf(held: unknown): ProgressKept | undefined {
  if (!isStored(held) || !isStored(held.files)) return undefined
  const files = Object.entries(held.files).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  return { value: held.value ?? null, files: Object.fromEntries(files) }
}

/** The progress that a row of `_t_once` keeps for a call of a `python`, or nothing where it keeps none. */
export const progressIn = (row: unknown): ProgressKept | undefined =>
  progressKeptOf(Reflect.get(Object(Reflect.get(Object(row), 'result')), 'progress'))
