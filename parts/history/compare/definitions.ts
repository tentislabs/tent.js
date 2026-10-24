import type { Change } from './change.ts'
import { fieldChanges, textOf } from './records.ts'
import { stepChanges } from './steps.ts'
import type { Stored } from './stored.ts'
import { isStored } from '../../core/internal.ts'

/** A description as compare reads it: its parts by their names. */
export type Described = Record<string, unknown>

// The parts of a description that hold definitions by their names, each with the word a change says of one.
const parts: [string, (record: Stored) => string][] = [
  ['tables', () => 'table'],
  ['functions', (record) => String(record.kind ?? 'function')],
  ['flows', (record) => (isStored(record.agent) ? 'agent' : 'flow')],
  ['screens', () => 'screen'],
  ['components', () => 'component'],
  ['services', () => 'service'],
  ['models', () => 'model'],
  ['routes', () => 'route'],
  ['incoming', () => 'incoming'],
  ['commands', () => 'command'],
  ['backfills', () => 'backfill'],
]

// What nobody wrote: the build worked it out, and what it was worked out from is compared itself.
const workedOut = ['stepNames', 'module', 'export', 'tiedTo', 'reads', 'touches', 'reaches', 'uses', 'opens', 'needs']

const recordsOf = (value: unknown): Record<string, Stored> => {
  const records: Record<string, Stored> = {}
  for (const [name, record] of Object.entries(isStored(value) ? value : {}))
    if (isStored(record)) records[name] = record
  return records
}

/**
 * Matches the names of two maps: a name that both hold is the same thing, and a name that only the newer one
 * holds is a rename where its `was` lists a name that only the older one holds. Nothing else is ever guessed to be
 * a rename. Answers each newer name with the older name of the same thing, and the names that only one side holds.
 */
function matched(
  a: Record<string, Stored>,
  b: Record<string, Stored>,
): { same: [string, string][]; added: string[]; removed: string[] } {
  const same: [string, string][] = []
  const added: string[] = []
  const taken = new Set<string>()
  for (const name of Object.keys(b)) {
    const was = Array.isArray(b[name].was) ? b[name].was.map(String) : []
    const old = Object.hasOwn(a, name) ? name : was.find((one) => Object.hasOwn(a, one) && !Object.hasOwn(b, one))
    if (old === undefined || taken.has(old)) added.push(name)
    else {
      taken.add(old)
      same.push([old, name])
    }
  }
  return { same, added, removed: Object.keys(a).filter((name) => !taken.has(name)) }
}

/** The columns of a table: added, removed, renamed with `was`, and changed by the path inside their type. */
function columnChanges(changes: Change[], table: string, a: unknown, b: unknown): void {
  const [before, after] = [recordsOf(a), recordsOf(b)]
  const { same, added, removed } = matched(before, after)
  for (const name of removed)
    changes.push({ change: 'removed', what: 'column', name: `${table}.${name}`, from: before[name] })
  for (const name of added) changes.push({ change: 'added', what: 'column', name: `${table}.${name}`, to: after[name] })
  for (const [old, name] of same) {
    if (old !== name)
      changes.push({ change: 'renamed', what: 'column', name: `${table}.${name}`, was: `${table}.${old}` })
    fieldChanges(changes, { what: 'column', name: `${table}.${name}` }, before[old], after[name], [], ['was'])
  }
}

/** How many lines of two texts differ: the lines that only one of them holds, counted on the side that holds more. */
export function linesApart(a: string, b: string): number {
  const counts = new Map<string, number>()
  for (const line of a.split('\n')) counts.set(line, (counts.get(line) ?? 0) + 1)
  let onlyB = 0
  for (const line of b.split('\n')) {
    const left = counts.get(line) ?? 0
    if (left > 0) counts.set(line, left - 1)
    else onlyB++
  }
  const onlyA = [...counts.values()].reduce((sum, one) => sum + one, 0)
  return Math.max(onlyA, onlyB)
}

/**
 * Compares the definitions of two descriptions. `textAt` answers the text of a definition in the files of a side,
 * from the first to the last character of its place: a code definition is changed when that text changed.
 * Answers the changes, in the order of the parts of a description.
 */
export function definitionChanges(
  a: Described,
  b: Described,
  textAt: (side: 'a' | 'b', name: string) => string | undefined,
): Change[] {
  const changes: Change[] = []
  for (const [part, wordOf] of parts) {
    const [before, after] = [recordsOf(a[part]), recordsOf(b[part])]
    const { same, added, removed } = matched(before, after)
    for (const name of removed) changes.push({ change: 'removed', what: wordOf(before[name]), name })
    for (const name of added) changes.push({ change: 'added', what: wordOf(after[name]), name })
    for (const [old, name] of same) {
      const [was, is] = [before[old], after[name]]
      const what = wordOf(is)
      if (old !== name) changes.push({ change: 'renamed', what, name, was: old })
      const skip = [...workedOut, 'was']
      if (part === 'tables') {
        columnChanges(changes, name, was.columns, is.columns)
        skip.push('columns')
      }
      for (const option of ['body', 'onFail'] as const) {
        if (!Array.isArray(was[option]) || !Array.isArray(is[option])) continue
        skip.push(option)
        if (part === 'flows') stepChanges(changes, name, option, was[option], is[option])
        else if (textOf(was[option]) !== textOf(is[option]))
          changes.push({ change: 'changed', what, name, path: [option] })
      }
      fieldChanges(changes, { what, name }, was, is, [], skip)
      // Code is changed when the text of its definition changed: a view is always code.
      const [textA, textB] = [textAt('a', old), textAt('b', name)]
      const code =
        was.form === 'code' || is.form === 'code' || ['routes', 'commands', 'screens', 'components'].includes(part)
      if (code && textA !== undefined && textB !== undefined && textA !== textB)
        changes.push({ change: 'changed', what, name, lines: linesApart(textA, textB) })
    }
  }
  const [appA, appB] = [isStored(a.app) ? a.app : {}, isStored(b.app) ? b.app : {}]
  fieldChanges(
    changes,
    { what: 'project', name: String(appB.name ?? appA.name ?? '') },
    a.project,
    b.project,
    [],
    ['was'],
  )
  for (const language of new Set([...Object.keys(recordsOf(a.messages)), ...Object.keys(recordsOf(b.messages))]))
    fieldChanges(
      changes,
      { what: 'messages', name: language },
      recordsOf(a.messages)[language] ?? {},
      recordsOf(b.messages)[language] ?? {},
    )
  fieldChanges(changes, { what: 'seed', name: 'seed' }, a.seed, b.seed, [], ['module'])
  return changes
}
