import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { Mode } from '../../data/index.ts'

/** The two kinds of value that a data folder keeps in files of their own. */
export type ValueKind = 'secrets' | 'settings'

/** Which of the two files of a kind a mode reads: the test files, or the live ones. */
export type ValuesMode = 'test' | 'live'

/** The modes `development` and `test` read the test files, and `live` the live ones. */
export const valuesHeldFor = (mode: Mode): ValuesMode => (mode === 'live' ? 'live' : 'test')

/** The file of a data folder that holds the values of one kind for test data or for live. */
export const valuesFile = (dataFolder: string, kind: ValueKind, held: ValuesMode): string =>
  join(dataFolder, `${kind}.${held}`)

const formatOf = (kind: ValueKind): string => `tent.${kind}/1`

/**
 * Reads the values of one file: `{ "format": "tent.<kind>/1", "values": { ... } }`. A file that is not there
 * holds none. Throws T0018 for a file that is of another form.
 */
export function readValues(file: string, kind: ValueKind): Record<string, unknown> {
  if (!existsSync(file)) return {}
  let read: unknown
  try {
    read = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    read = undefined
  }
  const values: unknown = Reflect.get(Object(read), 'values')
  if (Reflect.get(Object(read), 'format') !== formatOf(kind) || typeof values !== 'object' || values === null)
    throw new TentError('T0018', `The file ${file} is no file of ${kind}: it is not of the form ${formatOf(kind)}.`, {
      fix: `Put the file back as the engine wrote it, or remove it and set the ${kind} again.`,
    })
  return { ...values }
}

/**
 * Writes the values of one file, whole: beside the old one, and then renamed over it, so that an engine never
 * reads half a file.
 */
export function writeValues(file: string, kind: ValueKind, values: Record<string, unknown>): void {
  const sorted = Object.fromEntries(Object.entries(values).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  mkdirSync(dirname(file), { recursive: true })
  const next = `${file}.next`
  writeFileSync(next, `${JSON.stringify({ format: formatOf(kind), values: sorted }, null, 2)}\n`)
  renameSync(next, file)
}
