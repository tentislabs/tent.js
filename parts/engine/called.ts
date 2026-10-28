import { AsyncLocalStorage } from 'node:async_hooks'
import type { Wrote } from '../data/index.ts'

/** A row as the facts of a call hold it: its columns by their names. */
type Row = Record<string, unknown>

/** What a call did with the data, as a test is told it: each table it read with its rows, each row it wrote, and its trace. */
export interface CallFacts {
  trace?: string
  read: { table: string; rows: Row[] }[]
  wrote: { table: string; id: string; kind: Wrote['kind']; before?: Row; after?: Row }[]
}

/** What a piece of work answered or threw, with what it did with the data. */
export type CallDone<Answer> = CallFacts & ({ value: Answer } | { error: unknown })

// The most rows of one table that the facts of one call keep, of what it read and of what it wrote: a long test stays light.
const most = 50

// The facts of the call under way, where a test asked for them: every read and write of its work lands there.
const facts = new AsyncLocalStorage<CallFacts>()

/** Carries a piece of work out, and answers what it answered or threw, with every read and write it made and its trace. */
export async function calledFacts<Answer>(work: () => Promise<Answer>): Promise<CallDone<Answer>> {
  const made: CallFacts = { read: [], wrote: [] }
  return facts.run(made, async () => {
    try {
      const value = await work()
      return { ...made, value }
    } catch (error) {
      return { ...made, error }
    }
  })
}

/** The rows an answer of a read holds: a list, a page of rows, or one row. */
function rowsIn(answer: unknown): Row[] {
  const rows: unknown = Array.isArray(answer) ? answer : Reflect.get(Object(answer), 'rows')
  if (Array.isArray(rows)) return rows.filter((one) => typeof one === 'object' && one !== null)
  return typeof answer === 'object' && answer !== null ? [Object(answer)] : []
}

/** Notes a read of the call under way, by its table, with the rows it answered. */
export function factRead(table: string, answer: unknown): void {
  const held = facts.getStore()
  if (!held) return
  const kept = held.read.find((one) => one.table === table) ?? { table, rows: [] }
  if (!held.read.includes(kept)) held.read.push(kept)
  kept.rows.push(...rowsIn(answer).slice(0, most - kept.rows.length))
}

/** Notes a row that the call under way wrote, as it was before and as it is after. */
export function factWrote(w: Wrote): void {
  const held = facts.getStore()
  if (!held || held.wrote.filter((one) => one.table === w.table).length >= most) return
  held.wrote.push({
    table: w.table,
    id: String(w.row.id),
    kind: w.kind,
    ...(w.before ? { before: { ...w.before } } : {}),
    ...(w.kind === 'removed' ? {} : { after: { ...w.row } }),
  })
}

/** Notes the trace that the call under way stands in, the first that it opened. */
export function factTrace(trace: string): void {
  const held = facts.getStore()
  if (held && held.trace === undefined) held.trace = trace
}
