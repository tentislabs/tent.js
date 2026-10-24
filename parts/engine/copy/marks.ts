import type { Description } from '../../core/internal.ts'
import type { Commit } from './asked.ts'

/** A mark as it was read: the number of its epoch, and the one number, or a number for each table. */
export interface Mark {
  epoch: number
  n?: number
  tables?: Map<string, number>
}

// A mark of more characters is taken as a number that no reader holds.
const longest = 1024

// A mark that names more tables holds the one number.
const mostTables = 16

/** What stands for a mark that does not read: an epoch and a number that no machine holds. */
const unread: Mark = { epoch: Number.POSITIVE_INFINITY, n: Number.POSITIVE_INFINITY }

const wholeNumber = (text: string): number | undefined => (/^\d{1,15}$/.test(text) ? Number(text) : undefined)

/**
 * Takes the text of a mark, `<epoch's number>.<n>` or `<epoch's number>.<table>:<n>,<table>:<n>`. Answers the
 * mark, nothing for no text, and for a text that does not read or is too long a mark that no machine holds.
 */
export function markOf(text: string | null | undefined): Mark | undefined {
  if (text === null || text === undefined || text === '') return undefined
  if (text.length > longest) return unread
  const dot = text.indexOf('.')
  const epoch = wholeNumber(text.slice(0, Math.max(dot, 0)))
  const rest = text.slice(dot + 1)
  if (dot < 1 || epoch === undefined || rest === '') return unread
  const one = wholeNumber(rest)
  if (one !== undefined) return { epoch, n: one }
  const tables = new Map<string, number>()
  for (const pair of rest.split(',')) {
    const colon = pair.lastIndexOf(':')
    const n = wholeNumber(pair.slice(colon + 1))
    if (colon < 1 || n === undefined) return unread
    tables.set(pair.slice(0, colon), n)
  }
  return { epoch, tables }
}

/** Writes a mark as its text. */
export function markText(mark: Mark): string {
  if (mark.tables && mark.n === undefined)
    return `${mark.epoch}.${[...mark.tables].map(([table, n]) => `${table}:${n}`).join(',')}`
  return `${mark.epoch}.${mark.n ?? 0}`
}

/** The highest number that a mark names. */
const highest = (mark: Mark): number => Math.max(mark.n ?? 0, ...(mark.tables ? mark.tables.values() : []))

/**
 * Joins two marks: for each table the higher number, and the one number where either is one. A mark of an older
 * epoch than the other is dropped.
 */
export function joinMarks(one: Mark | undefined, other: Mark | undefined): Mark | undefined {
  if (!one || !other) return one ?? other
  if (one.epoch !== other.epoch) return one.epoch > other.epoch ? one : other
  if (!one.tables || !other.tables) return { epoch: one.epoch, n: Math.max(highest(one), highest(other)) }
  const tables = new Map(one.tables)
  for (const [table, n] of other.tables) tables.set(table, Math.max(tables.get(table) ?? 0, n))
  return tables.size > mostTables
    ? { epoch: one.epoch, n: highest({ epoch: one.epoch, tables }) }
    : { epoch: one.epoch, tables }
}

/**
 * Takes the number of an epoch and the commits that a request made. Answers their mark: the tables each touched,
 * each with the number of the last commit that touched it, and the one number where one of them holds `all` or
 * they touched more than 16 tables. Nothing for a request that made none.
 */
export function wroteMark(epoch: number, commits: Commit[]): Mark | undefined {
  if (!commits.length) return undefined
  const last = Math.max(...commits.map((one) => one.n))
  const tables = new Map<string, number>()
  for (const commit of commits) for (const table of commit.tables) tables.set(table, commit.n)
  if (commits.some((one) => one.all) || tables.size > mostTables || tables.size === 0) return { epoch, n: last }
  return { epoch, tables }
}

// The tables that the door itself reads to know the caller.
const ofTheDoor = ['users', '_t_sessions', '_t_api_keys', '_t_oauth']

const isCode = (rule: unknown): boolean => typeof Reflect.get(Object(rule), 'export') === 'string'

/**
 * Takes a description and the name of a function. Answers the tables that a read of it reads, where they are
 * known: for a query written with `rows` whose own rule is no `allow`, its `reads`, every table reached from them
 * through `reaches` of a table, and the tables the door reads. Nothing for any other function, and where the
 * `read` rule of one of those tables is code: such a read is held to the highest number of a mark.
 */
export function tablesRead(description: Description, name: string): Set<string> | undefined {
  const record = Object.hasOwn(description.functions, name) ? description.functions[name] : undefined
  const plan = Object(record?.plan)
  if (record?.kind !== 'query' || typeof plan.from !== 'string') return undefined
  const access = Object(record.access)
  if (access.test !== undefined || isCode(access)) return undefined
  // Each table is looked at once: those of the read, those the door reads, and every table that a rule of one reaches.
  const found = new Set<string>()
  const left = [...ofTheDoor, ...(Array.isArray(record.reads) ? record.reads.map(String) : [String(plan.from)])]
  for (let table = left.pop(); table !== undefined; table = left.pop()) {
    if (found.has(table)) continue
    found.add(table)
    const stored = Object.hasOwn(description.tables, table) ? description.tables[table] : undefined
    if (isCode(Object(stored?.access).read)) return undefined
    for (const reach of Array.isArray(stored?.reaches) ? stored.reaches : []) left.push(String(reach))
  }
  return found
}

/**
 * Takes the mark that a read names, the number of the epoch that a reader holds, and the tables of the read where
 * they are known. Answers the number the reader must hold before it answers: 0 for a mark of an older epoch, which
 * is held already, a number that no machine holds for a mark of a newer epoch, and otherwise the number of the
 * mark, or the highest that it gives one of those tables.
 */
export function neededBy(mark: Mark | undefined, epoch: number, tables: Set<string> | undefined): number {
  if (!mark || mark.epoch < epoch) return 0
  if (mark.epoch > epoch) return Number.POSITIVE_INFINITY
  if (!mark.tables || mark.n !== undefined || !tables) return highest(mark)
  return Math.max(0, ...[...mark.tables].filter(([table]) => tables.has(table)).map(([, n]) => n))
}
