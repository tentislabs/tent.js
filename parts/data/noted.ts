import type { Clock } from '../core/internal.ts'
import type { Searcher, Wrote } from './context.ts'
import type { FileName } from './fileName.ts'
import type { SinkChange } from './sink.ts'
import type { By, Bytes, Row, RowKey, TableLayout, TableStep, Tx } from './store.ts'
import { metaTable } from './tables.ts'

const system = { kind: 'system' } as const

/** What one write did, as it is noted while the write runs. */
export interface WriteNotes {
  rows: Wrote[]
  raw: { text: string; values: unknown[] }[]
  steps: TableStep[]
  // The write held table steps, also where it held none of a table that a record covers.
  stepped: boolean
  // What each raw text of the write was handed as the tables it touches, or nothing for a text that was handed none.
  touches: (string[] | undefined)[]
  // The write wrote a table that the record of a commit covers, so it takes a number.
  counts: boolean
  // A record was applied in the write: it is the write of a reader, which takes the number of its writer.
  applied: boolean
  // The vectors of a row that was added or changed, as the write left them, where a sink is handed them.
  vectors: Map<Row, Record<string, Float32Array>>
  // By whom the write was made, where it names one.
  by?: By
}

/** What is noted of a write that has done nothing yet. */
export const nothingNoted = (): WriteNotes => ({
  rows: [],
  raw: [],
  steps: [],
  stepped: false,
  touches: [],
  counts: false,
  applied: false,
  vectors: new Map(),
})

// The clock of the runtime, where none is handed in. Its timers do not keep a program from ending.
export const ownClock: Clock = {
  now: () => Date.now(),
  setTimer(at, run) {
    const timer = setTimeout(run, Math.max(0, at - Date.now()))
    timer.unref()
    return () => clearTimeout(timer)
  },
}

/** The vector columns of each table of a layout that has one: a sink is handed the vector of each with its row. */
export const vectorsIn = (layout: TableLayout[]): Map<string, string[]> =>
  new Map(
    layout.flatMap((table): [string, string[]][] => {
      const columns = Object.entries(table.columns)
        .filter(([name, type]) => type.kind === 'vector' && !table.unused?.includes(name))
        .map(([name]) => name)
      return columns.length && !table.retired ? [[table.name, columns]] : []
    }),
  )

/** The texts of a row in the columns its table is searched by. */
export function textsOf(layout: TableLayout, row: Row): Record<string, string> {
  const texts: Record<string, string> = {}
  for (const column of layout.search) if (typeof row[column] === 'string') texts[column] = row[column]
  return texts
}

/** The number of the last write that a data file holds, by what reads its `_t_meta`. */
export function numberIn(read: (plan: { from: string; one: 'get'; id: string }) => unknown): number {
  const held = read({ from: metaTable.name, one: 'get', id: 'n' })
  return typeof held === 'object' && held !== null && 'value' in held ? Number(held.value) : 0
}

/** A key of a row as a row that holds it: the id of a row of an app, or the columns of a key. */
const keyOf = (id: RowKey): Row => (typeof id === 'object' ? { ...id } : { id })

/**
 * Takes the write of a store, what is noted of it, the tables that are a machine's own, whether the row that
 * a removal takes away is read first, the vector columns of the tables whose vectors are noted with their rows,
 * for a sink, and whether a change notes what its row held before and which columns it set, for an archive that
 * an undo reads. Answers the same write, which notes each row as it is written, each raw text, and whether the
 * write takes a number.
 */
export function watching(
  tx: Tx,
  noted: WriteNotes,
  own: Set<string>,
  readsRemoved: boolean,
  vectors?: Map<string, string[]>,
  readsBefore = false,
): Tx {
  const note = (table: string, kind: Wrote['kind'], row: Row, more: Pick<Wrote, 'before' | 'columns'> = {}) => {
    noted.rows.push({ table, kind, row, ...more })
    if (!own.has(table)) noted.counts = true
    const columns = kind === 'removed' ? undefined : vectors?.get(table)
    if (!columns) return
    // A vector is no part of a row, so it is read beside it, inside the write.
    const read = tx.read({ from: table, one: 'get', id: String(row.id), pick: columns }, system)
    const held = Object.entries(typeof read === 'object' && read !== null ? read : {}).flatMap(
      ([column, vector]): [string, Float32Array][] =>
        Array.isArray(vector) ? [[column, Float32Array.from(vector.map(Number))]] : [],
    )
    if (held.length) noted.vectors.set(row, Object.fromEntries(held))
  }
  return {
    ...tx,
    add(table, values, caller) {
      const row = tx.add(table, values, caller)
      note(table, 'added', row)
      return row
    },
    change(table, id, values, caller) {
      const held = readsBefore && !own.has(table) ? tx.read({ from: table, one: 'get', id }, caller) : undefined
      const row = tx.change(table, id, values, caller)
      const before = typeof held === 'object' && held !== null && !Array.isArray(held) ? { ...held } : undefined
      note(table, 'changed', row, before ? { before, columns: Object.keys(values) } : {})
      return row
    },
    remove(table, id, caller) {
      // A sink is handed the row that was removed, as it was stored, and so is an archive.
      const before =
        readsRemoved || (readsBefore && !own.has(table)) ? tx.read({ from: table, one: 'get', id }, caller) : undefined
      tx.remove(table, id, caller)
      note(table, 'removed', typeof before === 'object' && before !== null ? { ...before } : keyOf(id))
    },
    sql(text, values, touches) {
      const answer = tx.sql(text, values, touches)
      // A raw text counts as one that wrote, whatever it did: it is not read here.
      noted.raw.push({ text, values })
      noted.touches.push(touches)
      noted.counts = true
      return answer
    },
  }
}

/**
 * One committed write as a sink is handed it: what it holds nothing of is left out, a row of a table that is a
 * machine's own among it, and a row holds the vector of each of its vector columns. With the store's record of
 * the write, for a sink that records, and by whom it was made and what its raw texts stated.
 */
export function sinkChange(
  n: number,
  at: number,
  noted: WriteNotes,
  own: Set<string>,
  of: { file?: FileName; gone?: FileName[]; record?: Bytes } = {},
): SinkChange {
  const rows = noted.rows
    .filter((one) => !own.has(one.table))
    .map((one) => {
      const vectors = noted.vectors.get(one.row)
      return vectors ? { ...one, row: { ...one.row, ...vectors } } : one
    })
  return {
    n,
    at,
    ...(rows.length ? { rows } : {}),
    ...(noted.raw.length ? { raw: noted.raw } : {}),
    ...(noted.steps.length ? { layout: noted.steps } : {}),
    ...statedBy(noted),
    ...(noted.by && Object.keys(noted.by).length ? { by: noted.by } : {}),
    ...of,
  }
}

/** What a kept change says of the raw texts of its write: the tables they stated, or that neither rows nor tables are known. */
export function statedBy(noted: WriteNotes): { tables?: string[]; all?: true } {
  const stated = noted.touches.flatMap((one) => one ?? [])
  return {
    ...(stated.length ? { tables: [...new Set(stated)] } : {}),
    ...(noted.touches.some((one) => one === undefined) ? { all: true } : {}),
  }
}

/**
 * Tells a searcher each row of a searched table that a committed write wrote, once, as the write left it: the
 * texts of the row in the columns its table is searched by, or nothing for a row that was removed. `searched` are
 * the searched tables by their names, and `file` the tenant's file the rows live in.
 */
export function tellSearcher(
  searcher: Searcher | undefined,
  searched: Map<string, TableLayout>,
  rows: Wrote[],
  file?: FileName,
): void {
  if (!searcher) return
  const last = new Map<string, Wrote>()
  for (const one of rows) if (searched.has(one.table)) last.set(`${one.table} ${String(one.row.id)}`, one)
  for (const { table, kind, row } of last.values()) {
    const by = searched.get(table)
    if (by) searcher.wrote(table, String(row.id), kind === 'removed' ? undefined : textsOf(by, row), file)
  }
}
