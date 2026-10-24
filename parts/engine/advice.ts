import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Finding } from '../core/index.ts'
import type { Description, Plan } from '../core/internal.ts'
import type { Advice } from './advised.ts'
import { adviceFindings, entryOf, indexed } from './advised.ts'
import type { Opened } from './opened.ts'

// The queries of each app that were advised on, by version: a note is written once a version.
const advised = new WeakMap<object, Set<string>>()
// What each app advised since it opened, which `tent check` is handed with the facts of the running app.
const given = new WeakMap<object, Advice[]>()

/** The columns a filter holds to one value, and those it holds to a range, in the order they are written. */
function columnsOf(filter: unknown, equal: string[], range: string[]): void {
  const [all, col]: unknown[] = [Reflect.get(Object(filter), 'all'), Reflect.get(Object(filter), 'col')]
  if (Array.isArray(all)) for (const one of all) columnsOf(one, equal, range)
  else if (typeof col === 'string' && !equal.includes(col) && !range.includes(col))
    (Object.hasOwn(Object(filter), 'is') ? equal : range).push(col)
}

/** The index that a plan would read by: the columns it holds to one value, then a range, then its order. */
function indexFor(plan: Plan): string[] {
  const equal: string[] = []
  const range: string[] = []
  columnsOf(plan.where, equal, range)
  const sorted = (plan.sort ?? []).map((one) => one.by).filter((by) => !equal.includes(by) && !by.includes('.'))
  return [...equal, ...range, ...sorted].filter((one, at, all) => all.indexOf(one) === at)
}

/**
 * The file a table is written in, where the build gave its place, and its line, worked out from the characters
 * that the place holds and the text of the file. The text is at hand where the bundle lies in the project it was
 * built from, under `.tent/build/`, as one of `tent dev` does; elsewhere the file alone is named.
 */
function placeOf(o: Opened, table: string): { file: string; line?: number } | undefined {
  const place: unknown = Reflect.get(Object(o.description.places), table)
  const [file, from]: unknown[] = [Reflect.get(Object(place), 'file'), Reflect.get(Object(place), 'from')]
  if (typeof file !== 'string') return undefined
  const built = dirname(o.bundle)
  const project = basename(built) === 'build' && basename(dirname(built)) === '.tent' ? dirname(dirname(built)) : ''
  const source = project ? join(project, file) : ''
  if (typeof from !== 'number' || !source || !existsSync(source)) return { file }
  return { file, line: readFileSync(source, 'utf8').slice(0, from).split('\n').length }
}

/** The index advice that an app gave since it opened, as the notes T2029 of the check, held against a description. */
export const advisedOf = (o: Opened, description: Description): Finding[] =>
  adviceFindings(given.get(o.handles) ?? [], description)

/**
 * Takes an app, a query that passed its slow bar, and the plans it read. Asks the store's own plan of each, once a
 * version for that query; where one reads a whole table that it filters or orders, writes the note T2029 into the
 * log with the exact entry of `indexes` that the table lacks, and the file and the line of the table, and keeps it
 * for `tent check`. It adds no index: an index costs every write, and that is the builder's choice.
 */
export function adviseSlow(o: Opened, query: string, plans: Plan[]): void {
  const done = advised.get(o.handles) ?? new Set<string>()
  advised.set(o.handles, done)
  const key = `${o.version}\n${query}`
  if (done.has(key) || !o.store.explain) return
  done.add(key)
  for (const plan of plans) {
    if (plan.one === 'get' || !Object.hasOwn(o.description.tables, plan.from)) continue
    const index = indexFor(plan)
    if (!index.length || indexed(o.description, plan.from, index)) continue
    let steps: string[]
    try {
      steps = o.store.explain(plan)
    } catch {
      continue
    }
    const whole = steps.some((step) => new RegExp(`^SCAN ${plan.from}(?: AS \\S+)?$`).test(step.trim()))
    if (!whole) continue
    const place = placeOf(o, plan.from)
    const at = place ? `, in ${place.file}${place.line === undefined ? '' : `:${place.line}`}` : ''
    const placed = place ? { place: place.file, ...(place.line === undefined ? {} : { line: place.line }) } : {}
    given.set(o.handles, [...(given.get(o.handles) ?? []), { query, table: plan.from, index, ...placed }])
    o.log.write('lines', {
      at: o.clock.now(),
      level: 'warn',
      message: `T2029: ${query} reads the whole table ${plan.from}: add \`${entryOf(index)}\` to it${at}. An index costs every write, so it is yours to add.`,
      data: JSON.stringify({
        code: 'T2029',
        query,
        table: plan.from,
        index,
        ...placed,
      }),
    })
    return
  }
}
