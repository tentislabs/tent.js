import type { Description } from '../../core/internal.ts'
import { isStored } from '../../core/internal.ts'

/** One column that work fills, as its `by` states it, with what holds where it states nothing. */
export interface FilledColumn {
  table: string
  column: string
  type: Record<string, unknown>
  // The field of the answer that fills it, where the answer is an object.
  take?: string
  old?: 'drop' | 'keep'
}

/**
 * The columns of one table that one work fills by one call for each row: those that name one work with one
 * `input`. Each field of the work's input is handed the column its `input` names, or the column of its own name;
 * a name with a dot reads through a link of the row.
 */
export interface FillGroup {
  key: string
  table: string
  work: string
  input: Record<string, string>
  columns: FilledColumn[]
  debounce: number
  tries: number
  order: 'missing' | 'oldest'
  version?: string
  perMinute?: number
  // A vector column whose model turns columns into it: how many rows are handed to one `embed`.
  embed?: { batch: number }
  // The most that the filling of the group may use in a day, and what it does at the limit.
  perDay?: Record<string, number>
  atLimit: 'wait' | 'fail'
}

/** Which column each field of the input of a work is handed: the one its `input` names, or the one of its own name. */
function inputFor(description: Description, work: string, by: Record<string, unknown>): Record<string, string> {
  const fn = Object.hasOwn(description.functions, work) ? description.functions[work] : undefined
  const model = Object.hasOwn(description.models, work) ? description.models[work] : undefined
  const stated = isStored(fn?.input) ? fn.input : isStored(model?.input) ? model.input : {}
  const named = isStored(by.input) ? by.input : {}
  return Object.fromEntries(
    Object.keys(stated).map((field) => [field, typeof named[field] === 'string' ? String(named[field]) : field]),
  )
}

/** The numbers of a record, by name. */
const numbersOf = (value: Record<string, unknown>): Record<string, number> =>
  Object.fromEntries(Object.entries(value).filter((one): one is [string, number] => typeof one[1] === 'number'))

// The groups of each description, worked out once.
const made = new WeakMap<Description, FillGroup[]>()

// What holds where a `by` says nothing: 5 seconds of standing still, and 3 tries.
const debounceFor = 5000
const triesFor = 3

/** The fill groups of a description, each filled column in one of them, in the order in which they are made: a group that reads a filled column after the group that fills it. */
export function fillGroups(description: Description): FillGroup[] {
  const held = made.get(description)
  if (held) return held
  const groups = new Map<string, FillGroup>()
  for (const [table, stored] of Object.entries(description.tables)) {
    const columns = isStored(stored.columns) ? stored.columns : {}
    for (const [column, type] of Object.entries(columns)) {
      if (!isStored(type) || !isStored(type.by)) continue
      const by = type.by
      // A vector column that states its model has the model turn the columns it names into the vector.
      const embeds = type.kind === 'vector' && typeof type.model === 'string' && Array.isArray(by.columns)
      if (typeof by.work !== 'string' && !embeds) continue
      const work = embeds ? String(type.model) : String(by.work)
      const input = embeds
        ? Object.fromEntries((Array.isArray(by.columns) ? by.columns : []).map((one) => [String(one), String(one)]))
        : inputFor(description, work, by)
      const key = `${table}\n${work}\n${JSON.stringify(input)}`
      const limits = isStored(by.limits) ? by.limits : {}
      const group: FillGroup = groups.get(key) ?? {
        key,
        table,
        work,
        input,
        columns: [],
        debounce: typeof by.debounce === 'number' ? by.debounce : debounceFor,
        tries: typeof by.tries === 'number' ? by.tries : triesFor,
        order: by.order === 'oldest' ? 'oldest' : 'missing',
        ...(typeof by.version === 'string' ? { version: by.version } : {}),
        ...(typeof limits.perMinute === 'number' ? { perMinute: limits.perMinute } : {}),
        ...(embeds ? { embed: { batch: typeof by.batch === 'number' && by.batch > 0 ? by.batch : 32 } } : {}),
        ...(isStored(limits.perDay) ? { perDay: numbersOf(limits.perDay) } : {}),
        atLimit: limits.atLimit === 'fail' ? 'fail' : 'wait',
      }
      group.columns.push({
        table,
        column,
        type,
        ...(typeof by.take === 'string' ? { take: by.take } : {}),
        ...(type.old === 'drop' || type.old === 'keep' ? { old: type.old } : {}),
      })
      groups.set(key, group)
    }
  }
  const all = ordered([...groups.values()])
  made.set(description, all)
  return all
}

/** A path through a link, as the link and the column it reads there. */
const pairOf = (path: string): [string, string] => [path.slice(0, path.indexOf('.')), path.slice(path.indexOf('.') + 1)]

/** The columns of the row that a group reads, and those it reads through a link, as `[link, column]`. */
export function readsOf(group: FillGroup): { own: string[]; linked: [string, string][] } {
  const paths = Object.values(group.input)
  return {
    own: paths.filter((path) => !path.includes('.')),
    linked: paths.filter((path) => path.includes('.')).map(pairOf),
  }
}

/** The groups in the order they are made: one that reads a column another fills comes after it. A ring keeps its order. */
function ordered(groups: FillGroup[]): FillGroup[] {
  const done: FillGroup[] = []
  const left = [...groups]
  while (left.length) {
    const next = left.findIndex((group) =>
      readsOf(group).own.every(
        (path) =>
          !left.some(
            (other) =>
              other !== group && other.table === group.table && other.columns.some((one) => one.column === path),
          ),
      ),
    )
    const [taken] = left.splice(next === -1 ? 0 : next, 1)
    if (taken) done.push(taken)
  }
  return done
}
