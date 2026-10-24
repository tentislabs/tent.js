import type { Finding } from '../errors.ts'
import { finding } from '../finding.ts'
import { isMarked } from '../mark.ts'
import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import { lengthOf, msOf, sizeOf } from '../time.ts'
import { keepAt, keptAt } from './kept.ts'
import { shownAs } from './shown.ts'
import { written } from '../write.ts'

/** What the build hands `describe` of one definition: the definition, where it stands, and what was read of its arrows. */
export interface Loaded {
  value: object
  file?: string
  line?: number
  from?: number
  to?: number
  exportName?: string
  views?: Record<string, object>
  bodies?: Record<string, object>
  why?: string
}

/** What is known while one definition is described: its name, where it stands, and the whole project around it. */
export interface Told {
  name: string
  loaded: Loaded
  findings: Finding[]
  // Every definition of the project by its name, with its kind and its options as they were written.
  all: Map<string, { kind: string; options: Stored; loaded: Loaded }>
}

/** Adds a finding of the definition that is being described, with its place where the build gave one. */
export function report(told: Told, code: string, message: string, fix: string): void {
  const { file, line } = told.loaded
  const where = file !== undefined && line !== undefined ? { where: { file, line, definition: told.name } } : {}
  told.findings.push(finding(code, `${told.name}: ${message}`, { fix, ...where }))
}

/** The options of a definition, or of a part of one, as a record. */
export const optionsOf = (value: unknown): Stored => (isStored(value) ? value : {})

/** How many letters must change to turn one word into another. */
function lettersApart(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    row = next
  }
  return row[b.length]
}

/** Answers the name of a list that is nearest to a word. */
const nearest = (word: string, names: readonly string[]): string =>
  [...names].sort((a, b) => lettersApart(word, a) - lettersApart(word, b) || (a < b ? -1 : 1))[0]

/** Reports each option that is none of the names: T1003, with the nearest real one. */
export function known(told: Told, what: string, options: Stored, names: readonly string[]): void {
  for (const option of Object.keys(options)) {
    if (names.includes(option) || options[option] === undefined) continue
    const near = nearest(option, names)
    report(
      told,
      'T1003',
      `${what} has no option \`${option}\`. The nearest one is \`${near}\`.`,
      `Write \`${near}\`, or take \`${option}\` out.`,
    )
  }
}

/** Reports each required option that is left out: T1008. */
export function required(told: Told, what: string, options: Stored, names: readonly string[]): void {
  for (const option of names)
    if (options[option] === undefined)
      report(told, 'T1008', `${what} states no \`${option}\`, which is required.`, `State \`${option}\`.`)
}

/** Turns a length of time in words into milliseconds. A number is taken as milliseconds. T1011 where the words do not read. */
export function ms(told: Told, option: string, written: unknown): number | undefined {
  if (written === undefined || typeof written === 'number') return written
  const read = lengthOf(written)
  if (read) return Math.round(read.n * msOf(read.unit))
  report(
    told,
    'T1011',
    `\`${option}\` is no length of time: ${shownAs(written)}.`,
    "Write a number and a unit, as '30 seconds' or '7 days'.",
  )
  return undefined
}

/** Turns a size in words into bytes. A number is taken as bytes. T1011 where the words do not read. */
export function bytes(told: Told, option: string, written: unknown): number | undefined {
  if (written === undefined || typeof written === 'number') return written
  const read = sizeOf(written)
  if (read !== undefined) return read
  report(
    told,
    'T1011',
    `\`${option}\` is no size: ${shownAs(written)}.`,
    "Write a number and KB, MB or GB, as '10 MB'.",
  )
  return undefined
}

/** Old names, as one name or a list of them, always as a list. */
export const wasOf = (written: unknown): unknown[] | undefined =>
  written === undefined ? undefined : Array.isArray(written) ? [...written] : [written]

/** The name of a definition that is handed on: the definition, a marker of it, or its name as text. */
export function handedName(handed: unknown): string {
  if (typeof handed === 'string') return handed
  const name: unknown =
    (typeof handed === 'object' || typeof handed === 'function') && handed !== null
      ? Reflect.get(handed, 'definition')
      : undefined
  return typeof name === 'string' ? name : ''
}

/** The names of a list of definitions that are handed on. */
export const handedNames = (handed: unknown): string[] | undefined =>
  Array.isArray(handed) ? handed.map(handedName) : undefined

const holdsNothing = (value: unknown): boolean =>
  value === undefined ||
  (Array.isArray(value) ? !value.length : isStored(value) && !isMarked(value) && !Object.keys(value).length)

/**
 * Sets a field of a stored record. A field that is not set, that is an empty list or an empty map, or that equals
 * its default is left out. A value equals its default where the two are written alike with their keys in order.
 */
export function setField(record: Stored, field: string, value: unknown, unless?: unknown): void {
  if (holdsNothing(value) || (unless !== undefined && written(value, undefined) === written(unless, undefined))) return
  keepAt(record, field, value)
}

/** Whether a name is camelCase letters and digits: a small letter first, then letters and digits. */
export const isCamelCase = (name: string): boolean => /^[a-z][a-zA-Z0-9]*$/.test(name)

/**
 * Answers what stands inside a stored record, for whoever walks one. Of a write it is its id, its tenant and the
 * value of each of its columns: the name of a column is the builder's word, and none of the format. Of any other
 * record it is each of its members.
 */
export function insideOf(node: Stored): unknown[] {
  const table = node.add ?? node.change ?? node.remove
  if (typeof table !== 'string' || !(isStored(node.values) || 'id' in node)) return Object.values(node)
  return [node.id, node.of, ...Object.values(isStored(node.values) ? node.values : {})]
}

/**
 * Takes a table and the names of a path through its columns. Answers the tables that the links among them lead
 * to, one after another, as far as each name is a link.
 */
export function throughLinks(told: Told, table: string, names: readonly string[]): string[] {
  const found: string[] = []
  let at = table
  for (const name of names) {
    const column = optionsOf(keptAt(optionsOf(told.all.get(at)?.options.columns), name))
    if (typeof column.table !== 'string') break
    at = column.table
    found.push(at)
  }
  return found
}

/** A copy of a record without the members that hold nothing, with every record inside it copied the same way. */
export function plainOf(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plainOf)
  if (!isStored(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, one]) => one !== undefined && typeof one !== 'function')
      .map(([name, one]) => [name, plainOf(one)]),
  )
}

/**
 * A copy of a record as `plainOf` makes it, without what equals what holds when it is left out: a flag that is
 * false, an empty list and an empty map. It is for a record all of whose flags are false when they are left out.
 */
export function leanOf(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(leanOf)
  if (!isStored(value)) return value
  const lean: Stored = {}
  for (const [name, one] of Object.entries(value))
    if (one !== false && typeof one !== 'function') setField(lean, name, isMarked(one) ? { ...one } : leanOf(one))
  return lean
}

/** The code form of something that is stored as a module: its export, which the build fills the module of. */
export const code = (name: string): Stored => ({ export: name })
