import { TentError } from '../core/index.ts'
import { isStored } from '../core/internal.ts'
import type { App } from '../engine/index.ts'
import { sampleOf } from './sample.ts'

type Row = Record<string, unknown>

// The rows that `make` made, counted across its calls, so a text of each is a text of its own.
const counted = new WeakMap<object, { n: number }>()

/**
 * `app.make(table, count, (i) => values)`: writes that many rows of a table as the system, as `app.user` does. A
 * column that the function gives a value for, by the number of the row from 0, takes it; one that may be left
 * out, has a default or is worked out by the engine is left out; every other is filled with a sample of its type
 * (`sampleOf`), a link with a row of its table that is made first. Answers the rows, in order. Throws T0002 for a table that is none,
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
        row[column] = await sampleOf(type, column, { n: seen.n, linked })
      }
      const written = await app.write([{ add: table, values: row }], { as: 'system' })
      const one: unknown = Array.isArray(written) ? written[0] : written
      rows.push(isStored(one) ? one : {})
    }
    return rows
  }
