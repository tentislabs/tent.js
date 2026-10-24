import { TentError } from '../errors.ts'
import { written } from '../write.ts'

/** What is known while one definition is written back as text, and what its text was seen to name. */
export interface Writing {
  // The name of the project, by which an option of it is read.
  project: string
  // The words of ours that the text calls, in the order they were first used.
  ours: Set<string>
  // The definitions that the text names, in the order they were first named.
  named: Set<string>
  // The top-level names of the file that the text reads, each with the value that is stored for it.
  tops: Map<string, unknown>
  // The text files that the text reads, each by the name of its import, with its path from the folder of the project.
  textFiles: Map<string, string>
  // The top-level names that two definitions hold different values under.
  clashes: Set<string>
  // The name that the `db` of the arrow being written was handed under.
  db: string
}

/** A new record of what a text names, for a project of that name. */
export const writingOf = (project = ''): Writing => ({
  project,
  ours: new Set(),
  named: new Set(),
  tops: new Map(),
  textFiles: new Map(),
  clashes: new Set(),
  db: 'db',
})

/** Notes that the text calls a word of ours, and answers the word. */
export function ours(w: Writing, word: string): string {
  w.ours.add(word)
  return word
}

/** Notes that the text names a definition, and answers the name. */
export function naming(w: Writing, name: string): string {
  w.named.add(name)
  return name
}

/** Notes that the text reads a top-level name of its file, with the value that is stored for it. */
export function top(w: Writing, name: string, value: unknown): string {
  if (w.tops.has(name) && written(w.tops.get(name), undefined) !== written(value, undefined)) w.clashes.add(name)
  else w.tops.set(name, value)
  return name
}

/** Thrown for what has no text of this kind: code, which a tool never writes. */
export const noText = (what: string): TentError =>
  new TentError('T0013', `${what} is code, and code has no text that is written from its record.`, {
    fix: 'Change the text of its file. Only a plain definition is written anew from the description.',
  })
