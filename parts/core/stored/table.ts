import { fieldsOf } from '../description.ts'
import { filterOf } from '../filter.ts'
import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import { heldFrom } from './from.ts'
import { keptAt } from './kept.ts'
import type { Told } from './shared.ts'
import {
  insideOf,
  isCamelCase,
  known,
  ms,
  optionsOf,
  report,
  required,
  setField,
  throughLinks,
  wasOf,
} from './shared.ts'
import { ruleOf, typesOf } from './type.ts'

/** The options of `table`. */
const tableOptions = [
  'columns',
  'owner',
  'access',
  'search',
  'indexes',
  'unique',
  'keepHistory',
  'removed',
  'tenant',
  'shows',
  'plain',
  'was',
  'kept',
  'lasts',
]

const reservedColumns = ['id', 'createdAt', 'updatedAt', 'any', 'all', 'not']

/** The tables that a stored filter reads: those of the plans inside it. */
export function tablesIn(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) for (const one of value) tablesIn(one, found)
  else if (isStored(value)) {
    if (typeof value.from === 'string') found.add(value.from)
    for (const one of insideOf(value)) tablesIn(one, found)
  }
  return found
}

/** The tables that the links of a table lead to, for each name that a filter reaches through a link. */
function linkedIn(told: Told, table: string, value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) for (const one of value) linkedIn(told, table, one, found)
  if (!isStored(value)) return
  if (typeof value.col === 'string')
    for (const reached of throughLinks(told, table, value.col.split('.').slice(0, -1))) found.add(reached)
  for (const one of insideOf(value)) linkedIn(told, table, one, found)
}

/**
 * Takes the options of `table` as they were written. Answers the record of the table as it is stored, with
 * `reaches` worked out for a `read` rule that is written as a value. Reports a reserved name of a column, and a
 * `users` table whose `roles` column is missing or of another type.
 */
export function tableOf(told: Told, o: Stored): Stored {
  known(told, 'table', o, tableOptions)
  const stored: Stored = {}
  if (o.shows === undefined) required(told, 'table', o, ['columns'])
  const columns = typesOf(told, 'columns', o.columns, true) ?? {}
  for (const name of Object.keys(columns)) {
    if (reservedColumns.includes(name))
      report(told, 'T1009', `the column name \`${name}\` is reserved.`, 'Give the column another name.')
    else if (!isCamelCase(name))
      report(
        told,
        'T1013',
        `the name of the column \`${name}\` is not camelCase letters and digits.`,
        'Start the name with a small letter, and write letters and digits alone.',
      )
    if (name === 'distance' && Object.values(columns).some((column) => column.kind === 'vector'))
      report(
        told,
        'T1009',
        'a table with a vector column may not have a column named `distance`.',
        'Give the column another name.',
      )
  }
  if (told.name === 'users') {
    const roles = columns.roles
    if (!roles) report(told, 'T1008', 'the `users` table has no `roles` column.', 'Add `roles: list(text())`.')
    else if (roles.kind !== 'list' || optionsOf(roles.of).kind !== 'text')
      report(told, 'T1014', 'the `roles` column of `users` is no `list(text())`.', 'Write `roles: list(text())`.')
  }
  heldFrom(told, columns)
  // The rule of a column is stored as the rules of a table are, under a name of its own for one that is code.
  for (const [name, written] of Object.entries(optionsOf(o.columns))) {
    const rule: unknown = Reflect.get(Object(written), 'read')
    const column = columns[name]
    if (rule === undefined || !column) continue
    const stored = ruleOf(told, `columns.${name}.read`, rule, `${told.name}__${name}_access_read`)
    if (stored) column.read = stored
  }
  setField(stored, 'columns', columns)
  setField(stored, 'owner', o.owner)
  const access: Stored = {}
  for (const [what, rule] of Object.entries(optionsOf(o.access)))
    setField(access, what, ruleOf(told, `access.${what}`, rule, `${told.name}_access_${what}`), { rule: 'nobody' })
  known(told, 'access of a table', optionsOf(o.access), fieldsOf('tables', '*', 'access'))
  setField(stored, 'access', access)
  const search = optionsOf(o.search)
  // Nothing of a private column is told to a caller who is limited, and a search would tell which rows hold a word.
  const searched: unknown = Array.isArray(o.search) ? o.search : search.columns
  for (const name of Array.isArray(searched) ? searched : [])
    if (typeof name === 'string' && keptAt(columns, name)?.private === true)
      report(
        told,
        'T1014',
        `\`search\` names the private column \`${name}\`.`,
        'Take the column out of `search`, or make it a column that every reader of the table may read.',
      )
  setField(
    stored,
    'search',
    Array.isArray(o.search) || search.by === undefined || search.by === 'words'
      ? (search.columns ?? o.search)
      : { ...search },
  )
  setField(stored, 'indexes', o.indexes)
  setField(stored, 'unique', o.unique)
  setField(stored, 'keepHistory', o.keepHistory, false)
  setField(stored, 'removed', o.removed)
  const read = optionsOf(access.read)
  if (read.rule === 'where' && read.filter !== undefined) {
    const reaches = tablesIn(read.filter)
    linkedIn(told, told.name, read.filter, reaches)
    reaches.delete(told.name)
    setField(stored, 'reaches', [...reaches])
  }
  setField(stored, 'tenant', o.tenant)
  setField(stored, 'shows', o.shows)
  setField(stored, 'plain', o.plain, false)
  setField(stored, 'was', wasOf(o.was))
  if (o.kept === undefined) setField(stored, 'lasts', lastsOf(told, o.lasts, columns))
  inMemory(told, o, columns, stored)
  return stored
}

/**
 * Stores `kept` and `lasts` of a table whose rows live in memory. Reports T1014 for a `kept` that is not
 * `'memory'`, for a `lasts` that is no length of time, which a row of memory lasts from its last write, and for
 * what a table of memory cannot hold: a file for each tenant, a search, row history, a vector.
 */
function inMemory(told: Told, o: Stored, columns: Record<string, Stored>, stored: Stored): void {
  if (o.kept === undefined) return
  if (o.kept !== 'memory') report(told, 'T1014', "`kept` takes `'memory'` alone.", "Write `kept: 'memory'`.")
  const lasts = typeof o.lasts === 'string' || typeof o.lasts === 'number' ? ms(told, 'lasts', o.lasts) : undefined
  if (o.lasts !== undefined && (typeof lasts !== 'number' || lasts <= 0))
    report(
      told,
      'T1014',
      '`lasts` of a table kept in memory is no length of time: a row of it lasts from its last write.',
      "Write it as '30 seconds'.",
    )
  const held = ['tenant', 'search', 'keepHistory', 'shows']
    .filter((name) => o[name] !== undefined && o[name] !== false)
    .map((name) => `\`${name}\``)
  if (Object.values(columns).some((type) => type.kind === 'vector')) held.push('vector column')
  for (const named of held)
    report(
      told,
      'T1014',
      `a table kept in memory holds no ${named}: its rows are gone by themselves.`,
      `Take the ${named} out, or keep the rows in a table that stays.`,
    )
  setField(stored, 'kept', o.kept)
  setField(stored, 'lasts', lasts)
}

/**
 * The stored form of `lasts` of a table that stays: the length of time in milliseconds, the moment it is counted
 * from, which is the last write of a row where `by` is left out, and the rows it names. A length alone is the same
 * as `{ for }`. Reports T1014 for a `by` that names no moment of the table, and for a length that is none.
 */
function lastsOf(told: Told, written: unknown, columns: Record<string, Stored>): Stored | undefined {
  if (written === undefined) return undefined
  const o = typeof written === 'string' ? { for: written } : optionsOf(written)
  known(told, 'lasts of a table', o, ['for', 'by', 'where'])
  const by = o.by === undefined ? 'updatedAt' : typeof o.by === 'string' ? o.by : ''
  const moment = by === 'createdAt' || by === 'updatedAt' || columns[by]?.kind === 'date'
  if (!moment)
    report(
      told,
      'T1014',
      `\`lasts\` counts from \`${by}\`, which is no moment of the table.`,
      'Name a `date` column of the table, or `createdAt` or `updatedAt`.',
    )
  const length = ms(told, 'lasts.for', o.for)
  if (typeof length !== 'number' || length <= 0)
    report(told, 'T1014', '`lasts` states no length of time.', "Write it as '90 days'.")
  const stored: Stored = { for: length, by }
  if (o.where !== undefined) stored.where = filterOf(o.where)
  return stored
}
