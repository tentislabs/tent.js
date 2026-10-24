import type { SQLInputValue } from 'node:sqlite'
import { TentError } from '../../core/index.ts'
import { isId } from '../ids.ts'
import type { ColumnType, Row, RowKey } from '../store.ts'
import { vectorBytes, vectorOf } from '../vector.ts'
import { isRowLink, vectorColumns, vectorTable } from './ddl.ts'
import { failed } from './failed.ts'
import { workedOut } from './from.ts'
import { q } from './names.ts'
import type { Held, Shape } from './shape.ts'
import { rowOf } from './shape.ts'
import { msOf, toStored } from './values.ts'
import { allRows } from './wide.ts'

const misfit = (table: string, column: string, why: string): TentError =>
  new TentError('T2107', `\`${column}\` of \`${table}\` ${why}.`, { fields: { [column]: 'type' } })

const notFound = (table: string, key: RowKey): TentError =>
  new TentError('T2103', `No row of \`${table}\` is found under ${JSON.stringify(key)}.`)

/** Takes a value as code holds it. Answers it as SQLite keeps it, a link as the inside number of the row it names. */
function kept(held: Held, shape: Shape, name: string, type: ColumnType, value: unknown): SQLInputValue {
  if (!isRowLink(type) || value === undefined || value === null) return toStored(type, value, shape.layout.name, name)
  if (typeof value !== 'string') throw misfit(shape.layout.name, name, 'takes the id of a row')
  const found = held.statement(`SELECT "_n" FROM ${q(type.table)} WHERE "id" = ?`).get(value)
  if (!found)
    throw new TentError(
      'T2104',
      `\`${name}\` of \`${shape.layout.name}\` names a row of \`${type.table}\` that does not exist.`,
    )
  return Number(found._n)
}

/** The values of a row that a write names, each held to be a column the table has. */
function named(shape: Shape, values: Row): [string, unknown][] {
  const given = Object.entries(values).filter(([, value]) => value !== undefined)
  for (const [name] of given)
    if (Object.hasOwn(shape.vectors, name)) continue
    else if (!Object.hasOwn(shape.types, name)) throw misfit(shape.layout.name, name, 'is no column of the table')
    else if (shape.worked.some((one) => one.name === name))
      throw misfit(shape.layout.name, name, 'is worked out from other columns, and cannot be written')
  return given
}

/** What finds one row: its text id, or the key of a table whose key is not `id`. */
function found(held: Held, shape: Shape, key: RowKey): { where: string; values: SQLInputValue[] } {
  const names = shape.layout.key ?? ['id']
  const record: Record<string, unknown> = typeof key === 'object' ? key : { [names[0]]: key }
  return {
    where: names.map((name) => `${q(name)} = ?`).join(' AND '),
    values: names.map((name) => kept(held, shape, name, shape.types[name], record[name])),
  }
}

/** Reads one row back as code sees it. */
function read(held: Held, shape: Shape, where: string, values: SQLInputValue[]): Row | undefined {
  const [row] = allRows(held.statement(`${shape.select} WHERE ${where}`), values)
  return row ? rowOf(shape, row) : undefined
}

/**
 * Takes what an open store holds, `touched`, which is told each row that is written, `vectored`, which is told
 * each vector that is set or removed, and `added`, which is told the inside number of each new row of a table that
 * has a vector column. Answers the three writes
 * of a row. Each throws T2107 for a value that does not fit its column, T2104 for a link whose row is missing,
 * T2101 where a `unique` rule breaks, and `change` and `remove` T2103 for a row that is not there.
 */
export function rowWrites(
  held: Held,
  touched: (table: string, id: string) => void,
  vectored: (table: string, column: string, n: number, vector: Float32Array | undefined) => void,
  added: (table: string, n: number) => void,
) {
  /** The vectors that a write gives a row, each held to its column before anything is written: nothing for one that is cleared. */
  const heldVectors = (shape: Shape, values: Row): [string, Float32Array | undefined][] =>
    Object.entries(shape.vectors).flatMap(([column, size]): [string, Float32Array | undefined][] => {
      const value = values[column]
      if (value === undefined) return []
      return [[column, value === null ? undefined : vectorOf(value, size, shape.layout.name, column)]]
    })
  /** Writes the vectors of a row into the table of each, and takes one away that is cleared. */
  const vectors = (shape: Shape, n: number, set: [string, Float32Array | undefined][]) => {
    const table = shape.layout.name
    for (const [column, vector] of set) {
      const kept = q(vectorTable(table, column))
      if (vector)
        run(
          table,
          `INSERT INTO ${kept} ("_n", "v") VALUES (?, ?) ON CONFLICT ("_n") DO UPDATE SET "v" = excluded."v"`,
          [n, vectorBytes(vector)],
        )
      else run(table, `DELETE FROM ${kept} WHERE "_n" = ?`, [n])
      vectored(table, column, n, vector)
    }
  }
  /** The inside number of a row of a table of an app, by what finds it. */
  const numberOf = (shape: Shape, at: { where: string; values: SQLInputValue[] }): number | undefined => {
    const row = held.statement(`SELECT "_n" FROM ${q(shape.layout.name)} WHERE ${at.where}`).get(...at.values)
    return row ? Number(row._n) : undefined
  }

  const run = (table: string, sql: string, values: SQLInputValue[], removing = false) => {
    try {
      return held.statement(sql).run(...values)
    } catch (error) {
      throw failed(error, table, removing)
    }
  }
  const idOf = (key: RowKey): string => (typeof key === 'object' ? JSON.stringify(key) : String(key))
  const pick = (row: Row, names: string[]): Row => Object.fromEntries(names.map((name) => [name, row[name]]))

  return {
    /** Adds a row. A table of an app is given its id and its two moments here, unless the values hold them. */
    add(table: string, values: Row): Row {
      const shape = held.shape(table)
      named(shape, values)
      const set = heldVectors(shape, values)
      const filled: Row = { ...values }
      if (!shape.layout.key) {
        // A table with a key of its own has no moments, so its row reads no clock: it is written inside a query too.
        const now = Date.now()
        if (filled.id === undefined) filled.id = held.ids.next()
        else if (!isId(filled.id)) throw misfit(table, 'id', 'is no id')
        else held.ids.above(filled.id)
        filled.createdAt = msOf(filled.createdAt) === undefined ? new Date(now) : filled.createdAt
        filled.updatedAt ??= filled.createdAt
      }
      // A column of a key that holds nothing holds empty text, or 0 for a number and a moment.
      for (const name of shape.layout.key ?? [])
        filled[name] ??= ['number', 'date'].includes(shape.types[name].kind) ? 0 : ''
      Object.assign(filled, workedOut(shape.worked, filled))
      const made = run(
        table,
        shape.insert,
        shape.names.map((name) => kept(held, shape, name, shape.types[name], filled[name])),
      )
      const key = shape.layout.key
      const row = key
        ? // By the name of the inside row number that no column of a table can hide.
          read(held, shape, '_rowid_ = ?', [made.lastInsertRowid])
        : read(held, shape, '"_n" = ?', [made.lastInsertRowid])
      if (!row) throw notFound(table, String(filled.id))
      if (!key) vectors(shape, Number(made.lastInsertRowid), set)
      if (!key && Object.keys(shape.vectors).length) added(table, Number(made.lastInsertRowid))
      touched(table, key ? idOf(key.length === 1 ? String(row[key[0]]) : pick(row, key)) : String(row.id))
      return row
    },

    /** Changes the named columns of a row: `null` clears one. */
    change(table: string, key: RowKey, values: Row): Row {
      const shape = held.shape(table)
      const given = named(shape, values)
      if (given.some(([name]) => (shape.layout.key ?? ['id']).includes(name)))
        throw misfit(table, (shape.layout.key ?? ['id'])[0], 'is the key of its row, which a change does not move')
      const at = found(held, shape, key)
      const set = heldVectors(shape, values)
      const sets: [string, unknown][] = given.filter(([name]) => !Object.hasOwn(shape.vectors, name))
      if (!shape.layout.key && !('updatedAt' in values)) sets.push(['updatedAt', new Date()])
      if (shape.worked.length) {
        // A column with `from` is worked out anew from the row as the change leaves it.
        const before = read(held, shape, at.where, at.values)
        if (!before) throw notFound(table, key)
        const left: Row = { ...before }
        for (const [name, value] of given) left[name] = value
        sets.push(...Object.entries(workedOut(shape.worked, left)))
      }
      // A change that names no column changes nothing, and still answers the row.
      if (sets.length)
        run(table, `UPDATE ${q(table)} SET ${sets.map(([name]) => `${q(name)} = ?`).join(', ')} WHERE ${at.where}`, [
          ...sets.map(([name, value]) => kept(held, shape, name, shape.types[name], value)),
          ...at.values,
        ])
      const row = read(held, shape, at.where, at.values)
      if (!row) throw notFound(table, key)
      const n = set.length ? numberOf(shape, at) : undefined
      if (n !== undefined) vectors(shape, n, set)
      touched(table, idOf(key))
      return row
    },

    /** Removes a row. */
    remove(table: string, key: RowKey): void {
      const shape = held.shape(table)
      const at = found(held, shape, key)
      // Removing a row removes its vectors, a retired column's too.
      const kept = shape.layout.key ? [] : vectorColumns(shape.layout)
      const n = kept.length ? numberOf(shape, at) : undefined
      if (!run(table, `DELETE FROM ${q(table)} WHERE ${at.where}`, at.values, true).changes) throw notFound(table, key)
      for (const column of n === undefined ? [] : kept) {
        run(table, `DELETE FROM ${q(vectorTable(table, column))} WHERE "_n" = ?`, [Number(n)])
        if (Object.hasOwn(shape.vectors, column)) vectored(table, column, Number(n), undefined)
      }
      touched(table, idOf(key))
    },
  }
}
