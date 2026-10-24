import { TentError } from '../core/index.ts'
import { isStored } from '../core/internal.ts'
import type { App } from '../engine/index.ts'

type Row = Record<string, unknown>

// The rows that `make` made, counted across its calls, so a text of each is a text of its own.
const counted = new WeakMap<object, { n: number }>()

const two = (n: number): string => String(n).padStart(2, '0')

/** A value that a type gives where a test gives none: the first of a choice, a text of its own, the lowest number. */
function filled(
  app: App,
  type: Row,
  column: string,
  n: number,
  linked: (table: string) => Promise<string>,
): Promise<unknown> | unknown {
  const kind = type.kind
  const min = typeof type.min === 'number' ? type.min : undefined
  const max = typeof type.max === 'number' ? type.max : undefined
  if (kind === 'text') {
    const text = `${column} ${n}`.padEnd(min ?? 0, '.')
    return max === undefined ? text : text.slice(0, max)
  }
  if (kind === 'number') return Math.min(min ?? 0, max ?? Number.POSITIVE_INFINITY)
  if (kind === 'boolean') return false
  if (kind === 'date') return new Date()
  if (kind === 'day') {
    const now = new Date()
    return `${now.getUTCFullYear()}-${two(now.getUTCMonth() + 1)}-${two(now.getUTCDate())}`
  }
  if (kind === 'choice') return Array.isArray(type.values) ? type.values[0] : undefined
  if (kind === 'link' && typeof type.table === 'string') return linked(type.table)
  if (kind === 'json') return {}
  if (kind === 'list') return []
  if (kind === 'vector') return Array.from({ length: typeof type.size === 'number' ? type.size : 0 }, () => 0)
  if (kind === 'object' && isStored(type.shape)) {
    const shape = type.shape
    return Promise.all(
      Object.entries(shape).flatMap(([name, one]) =>
        isStored(one) && one.optional !== true
          ? [Promise.resolve(filled(app, one, name, n, linked)).then((value) => [name, value])]
          : [],
      ),
    ).then(Object.fromEntries)
  }
  throw new TentError(
    'T0002',
    `\`app.make\` cannot fill \`${column}\`, a column of the kind ${String(kind)}: give it a value.`,
    {
      fields: { [column]: 'required' },
    },
  )
}

/**
 * `app.make(table, count, (i) => values)`: writes that many rows of a table as the system, as `app.user` does. A
 * column that the function gives a value for, by the number of the row from 0, takes it; one that may be left
 * out, has a default or is worked out by the engine is left out; every other is filled from its type: a choice
 * its first value, a text one of its own, a number its lowest, `false`, the moment and the day that run, and a
 * link a row of its table that is made first. Answers the rows, in order. Throws T0002 for a table that is none,
 * and for a column whose kind it cannot fill.
 */
export const make =
  (app: App) =>
  async (table: string, count: number, values?: (i: number) => Row): Promise<Row[]> => {
    const stated = app.description.tables[table]
    if (!isStored(stated))
      throw new TentError('T0002', `\`app.make\` names no table ${JSON.stringify(table).slice(0, 80)}.`, {
        fields: { table: 'values' },
      })
    const columns: Row = isStored(stated.columns) ? stated.columns : {}
    const seen = counted.get(app) ?? { n: 0 }
    counted.set(app, seen)
    const linked = async (to: string): Promise<string> => {
      const [row] = await make(app)(to, 1)
      return String(row?.id)
    }
    const rows: Row[] = []
    for (let i = 0; i < count; i++) {
      const given = values?.(i) ?? {}
      seen.n++
      const row: Row = { ...given }
      for (const [column, type] of Object.entries(columns)) {
        if (Object.hasOwn(given, column) || !isStored(type)) continue
        if (type.optional === true || type.default !== undefined || type.from !== undefined || type.keeps !== undefined)
          continue
        row[column] = await filled(app, type, column, seen.n, linked)
      }
      const written = await app.write([{ add: table, values: row }], { as: 'system' })
      const one: unknown = Array.isArray(written) ? written[0] : written
      rows.push(isStored(one) ? one : {})
    }
    return rows
  }
