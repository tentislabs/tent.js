import { sqlitePath } from '../data/index.ts'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Finding } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { finding } from '../core/internal.ts'

/** One piece of index advice: the query that read a whole table, the table, the index it lacks, and its place. */
export interface Advice {
  query: string
  table: string
  index: string[]
  place?: string
  line?: number
}

const isAdvice = (value: unknown): value is Advice =>
  typeof Reflect.get(Object(value), 'query') === 'string' &&
  typeof Reflect.get(Object(value), 'table') === 'string' &&
  Array.isArray(Reflect.get(Object(value), 'index'))

/** Whether a table of a description holds an index that begins with these columns already. */
export function indexed(description: Description, table: string, columns: string[]): boolean {
  const stated: unknown = Reflect.get(Object(description.tables[table]), 'indexes')
  return (Array.isArray(stated) ? stated : []).some(
    (one) => Array.isArray(one) && columns.every((column, at) => one[at] === column),
  )
}

/** The exact entry of `indexes` that a piece of advice names. */
export const entryOf = (index: string[]): string => `indexes: [[${index.map((one) => `'${one}'`).join(', ')}]]`

/**
 * Takes pieces of index advice and the description they are held against. Answers each as the note T2029 of the
 * check, with the file and the line of the table where they are known, once for each table and index, leaving out
 * a table that is gone and one that holds the index by now.
 */
export function adviceFindings(advice: Advice[], description: Description): Finding[] {
  const seen = new Set<string>()
  return advice.flatMap((one) => {
    const key = `${one.table}\n${one.index.join('\n')}`
    if (seen.has(key) || !Object.hasOwn(description.tables, one.table) || indexed(description, one.table, one.index))
      return []
    seen.add(key)
    const where =
      typeof one.place === 'string' && typeof one.line === 'number'
        ? { where: { file: one.place, line: one.line } }
        : {}
    return [
      finding(
        'T2029',
        `The query \`${one.query}\` reads the whole table \`${one.table}\` past its slow bar: \`${entryOf(one.index)}\` would read it by an index.`,
        {
          fix: `Add \`${entryOf(one.index)}\` to the table. An index costs every write, so it is yours to add.`,
          ...where,
        },
        'note',
      ),
    ]
  })
}

/**
 * Takes a data folder whose engine is stopped, and a description. Answers the index advice that its log holds, as
 * the notes T2029 of the check: the log keeps each note the engine wrote, and it reads the log alone.
 */
export function advisedIn(dataFolder: string, description: Description): Finding[] {
  const file = join(dataFolder, 'logs.db')
  if (!existsSync(file)) return []
  const log = new DatabaseSync(sqlitePath(file), { readOnly: true })
  try {
    const rows = log.prepare(`SELECT "data" FROM "lines" WHERE "data" LIKE '%"code":"T2029"%' ORDER BY rowid`).all()
    const advice = rows.flatMap((row) => {
      let data: unknown
      try {
        data = JSON.parse(String(row.data))
      } catch {
        return []
      }
      return isAdvice(data) ? [data] : []
    })
    return adviceFindings(advice, description)
  } catch {
    // A log that holds no lines yet gives no advice.
    return []
  } finally {
    log.close()
  }
}
