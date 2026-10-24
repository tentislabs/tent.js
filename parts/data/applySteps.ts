import type { Seal } from './context.ts'
import { boundOf, noKey } from './context.ts'
import { momentDefault } from './defaults.ts'
import { keptBySteps, keptWalkName } from './counting.ts'
import { keepNames } from './formerNames.ts'
import { foundColumn } from './found.ts'
import { isSealed } from './keptType.ts'
import type { Row, Store, TableLayout, TableStep, Tx } from './store.ts'
import { turnKept } from './turnKept.ts'
import { startWalk } from './walk.ts'

const system = { kind: 'system' } as const

/** A column whose rows are written anew after the steps: where it lay in the file, and whether it was and is sealed. */
interface Turn {
  table: string
  column: string
  from: { table: string; column: string }
  opens: boolean
  seals: boolean
}

/**
 * Answers the columns whose values the steps leave for `data` to write: one that `sealed` is added to or taken
 * from, and a sealed one whose table or whose own name changes, since a sealed value is bound to both.
 */
function turnsOf(file: Map<string, TableLayout>, steps: TableStep[]): Turn[] {
  // Where each table and each column that the steps renamed lies in the file.
  const tableIn = new Map<string, string>()
  const columnIn = new Map<string, string>()
  const inFile = (table: string, column: string) => ({
    table: tableIn.get(table) ?? table,
    column: columnIn.get(`${table} ${column}`) ?? column,
  })
  const turns = new Map<string, Turn>()
  const turn = (table: string, column: string, seals?: boolean) => {
    const from = inFile(table, column)
    const layout = file.get(from.table)
    const type = layout?.columns[from.column]
    if (!type || layout?.retired || layout?.unused?.includes(from.column)) return
    const opens = isSealed(type)
    const held = turns.get(`${table} ${column}`)
    turns.set(`${table} ${column}`, { table, column, from, opens, seals: seals ?? held?.seals ?? opens })
  }
  for (const step of steps) {
    if (step.do === 'renameTable' && step.from !== undefined) {
      const from = tableIn.get(step.from) ?? step.from
      tableIn.set(step.table, from)
      for (const [column, type] of Object.entries(file.get(from)?.columns ?? {}))
        if (isSealed(type)) turn(step.table, column)
    }
    if (step.do === 'renameColumn' && step.column !== undefined && step.from !== undefined) {
      const from = inFile(step.table, step.from)
      columnIn.set(`${step.table} ${step.column}`, from.column)
      turns.delete(`${step.table} ${step.from}`)
      if (isSealed(file.get(from.table)?.columns[from.column])) turn(step.table, step.column)
    }
    if (step.do === 'retype' && step.column !== undefined && step.to) {
      const from = inFile(step.table, step.column)
      const was = isSealed(file.get(from.table)?.columns[from.column])
      if (was !== isSealed(step.to) || turns.has(`${step.table} ${step.column}`))
        turn(step.table, step.column, isSealed(step.to))
    }
  }
  return [...turns.values()].filter((one) => one.opens || one.seals)
}

/**
 * Answers the steps with what each new column gives the rows that are there, where its default is worked out from
 * the moment of the write: one moment for them all, as text, so that it travels to a reader as it is.
 */
function withValues(steps: TableStep[], at: number): TableStep[] {
  return steps.map((step) => {
    if (step.do !== 'addColumn' || !step.to || step.value !== undefined) return step
    const worked = momentDefault(step.to, at)
    return worked === undefined ? step : { ...step, value: worked instanceof Date ? worked.toISOString() : worked }
  })
}

/**
 * Takes the write it is called in, the store of that write, the steps of a table change, and the `Seal`. It is
 * called inside a write that was begun with `steps: true`, as its first act. It carries the steps out by the
 * store's own `applyTableChanges`, each new column whose default is `now` or `today` with the value it works out
 * for the rows that are there, and then seals and opens what they ask for: the store carries a column that
 * `sealed` is added to or taken from over empty, and each of its values is written here, through `tx`, bound to its
 * row. Its values are read before the steps, since the store cannot read what is sealed. The value of such a column
 * is sealed or opened in every kept version of a row too. This is the writer's work alone: a reader is handed those
 * rows in the record of the write. Throws T0019 where a value is to be sealed or opened and no key is at hand.
 * `now` is the clock of the write, which a `db` is handed too: the moment of a default is read from it.
 */
export function applySteps(
  tx: Tx,
  store: Store,
  steps: TableStep[],
  o: { seal?: Seal; now?: () => number } = {},
): void {
  stepsThenRows(tx, store, steps, o)
}

/**
 * Carries the steps of a table change out, and then seals and opens what they ask for, as `applySteps` does.
 * `between` is called once the store has carried the steps out and before a row is written: whoever has more table
 * steps for the same write, as the dropping of what a file holds retired, carries them out there, since the steps
 * of a write are its first act.
 */
export function stepsThenRows(
  tx: Tx,
  store: Store,
  steps: TableStep[],
  o: { seal?: Seal; now?: () => number },
  between?: () => void,
): void {
  const turns = turnsOf(new Map(store.layout().map((layout) => [layout.name, layout])), steps)
  const held = turns.map((turn) => {
    const { table, column } = turn.from
    const read = tx.read({ from: table, pick: ['id', 'updatedAt', column] }, system)
    const rows: Row[] = (Array.isArray(read) ? read : []).filter((row: Row) => row[column] !== undefined)
    if (rows.length && !o.seal) throw noKey(table, column)
    return rows.map((row) => ({
      id: String(row.id),
      updatedAt: row.updatedAt,
      value: turn.opens ? o.seal?.open(String(row[column]), boundOf(table, column, row.id)) : row[column],
    }))
  })
  store.applyTableChanges(withValues(steps, (o.now ?? Date.now)()))
  between?.()
  keepNames(tx, steps)
  for (const [i, { table, column, seals }] of turns.entries())
    for (const { id, updatedAt, value } of held[i])
      tx.change(
        table,
        id,
        { [column]: seals ? o.seal?.close(value, boundOf(table, column, id)) : value, updatedAt },
        system,
      )
  // What a column seals lies open in no kept version of a row, and what it seals no more is sealed in none.
  for (const turn of turns) if (turn.opens !== turn.seals) turnKept(tx, store, turn, o.seal)
  // A kept column that the steps make, or keep another way, is filled first by the one walk of the switch.
  for (const kept of keptBySteps(store, steps)) startWalk(tx, keptWalkName(kept))
  // A sealed column that is found from now on is given the fingerprint of each value it holds.
  foundWalk(tx, steps, o.seal)
}

/** Writes the fingerprint of each value of a sealed column whose column of fingerprints the steps made. */
function foundWalk(tx: Tx, steps: TableStep[], seal: Seal | undefined): void {
  for (const step of steps) {
    const ending = foundColumn('')
    if (step.do !== 'addColumn' || !step.column?.endsWith(ending)) continue
    const column = step.column.slice(0, -ending.length)
    const read: unknown = tx.read({ from: step.table, pick: ['id', 'updatedAt', column] }, system)
    for (const row of Array.isArray(read) ? read : []) {
      if (typeof row[column] !== 'string') continue
      if (!seal?.find) throw noKey(step.table, column)
      const value = seal.open(row[column], boundOf(step.table, column, row.id))
      tx.change(
        step.table,
        String(row.id),
        { [step.column]: seal.find(value, `${step.table}.${column}`), updatedAt: row.updatedAt },
        system,
      )
    }
  }
}
