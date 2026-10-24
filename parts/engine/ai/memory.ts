import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Tx } from '../../data/index.ts'
import type { CallContext } from '../context.ts'
import { atOf, onceKey, whichCall } from '../flows/inside.ts'
import { stepRowOf } from '../flows/once.ts'
import type { Opened } from '../opened.ts'
import { dbFor } from '../program.ts'
import { textOf } from '../readers/text.ts'
import { fileRow, wholeBytes } from '../stored/files.ts'
import { table as filesTable } from '../tables/files.ts'
import { table as holdsTable } from '../tables/holds.ts'
import { stepKey, table as onceTable } from '../tables/once.ts'
import { isStored } from '../../core/internal.ts'

const system: Caller = { kind: 'system' }

/** What the engine reads of the memory of an agent: its table, its columns, and what is sent of it. */
export interface MemoryOf {
  table: string
  thread: string
  linked?: string
  owner?: string
  keep: number
  after: number
  shrink: 'all' | 'drop' | 'summary' | 'own' | 'nearest'
  // With `shrink: { nearest }`: how many older turns nearest to the message are sent beside the latest.
  nearest?: number
}

/** A row of a conversation as it is sent, with each file of it read. */
interface Recalled {
  id: string
  who: string
  text?: string
  data?: unknown
  files?: { id: string; name: string; kind: string; words?: string; image?: Uint8Array }[]
}

/** The error of a conversation the starter may not open: told as one that is not there. */
const notThere = (thread: string): TentError =>
  new TentError('T2103', `No conversation ${JSON.stringify(thread).slice(0, 60)} is there for this caller.`, {
    fix: 'Start the agent on a conversation that the caller may read.',
  })

/** The memory of an agent, as the description of the version holds it. Throws T0001 for one that has none. */
export function memoryOf(o: Opened, agent: string): MemoryOf {
  const flow = Object.hasOwn(o.description.flows, agent) ? o.description.flows[agent] : undefined
  const memory: unknown = Reflect.get(Object(flow?.agent), 'memory')
  if (!isStored(memory)) throw new TentError('T0001', `The agent ${agent} keeps no memory.`)
  const table = String(memory.in)
  const thread = typeof memory.thread === 'string' ? memory.thread : 'thread'
  const stored = Object.hasOwn(o.description.tables, table) ? o.description.tables[table] : undefined
  const column: unknown = Reflect.get(Object(stored?.columns), thread)
  const linked: unknown = Reflect.get(Object(column), 'table')
  const owner: unknown = stored?.owner
  const keep = typeof memory.keep === 'number' ? memory.keep : 10
  const shrink: unknown = memory.shrink
  const nearest: unknown = Reflect.get(Object(shrink), 'nearest')
  if (typeof nearest === 'number')
    return {
      table,
      thread,
      ...(typeof linked === 'string' ? { linked } : {}),
      ...(typeof owner === 'string' ? { owner } : {}),
      keep,
      after: typeof memory.after === 'number' ? memory.after : keep,
      shrink: 'nearest',
      nearest,
    }
  return {
    table,
    thread,
    ...(typeof linked === 'string' ? { linked } : {}),
    ...(typeof owner === 'string' ? { owner } : {}),
    keep,
    after: typeof memory.after === 'number' ? memory.after : keep,
    shrink:
      shrink === 'drop' || shrink === 'summary' || shrink === 'all' || shrink === undefined ? (shrink ?? 'all') : 'own',
  }
}

/**
 * The first of the two checks that open a conversation that are the engine's here: that the starter may read the
 * row that the conversation's value names, under the read rule of the table its column links to. The agent's
 * `access` was asked at the start. Throws T2103 otherwise, as for a row that is not there.
 */
export function mayOpen(o: Opened, memory: { linked?: string }, thread: string, caller: Caller): void {
  if (!memory.linked || caller.kind === 'system') return
  const tables: unknown = dbFor(o, caller)
  const of: unknown = Reflect.get(Object(tables), memory.linked)
  const get: unknown = Reflect.get(Object(of), 'get')
  const row: unknown = typeof get === 'function' ? Reflect.apply(get, of, [thread]) : undefined
  if (row === undefined || row === null) throw notThere(thread)
}

/** The rows of a conversation, every one, in the order they were added, which is the order of their ids. */
function rowsOf(o: Opened, memory: MemoryOf, thread: string): Record<string, unknown>[] {
  const read: unknown = o.store.read({ from: memory.table, where: { col: memory.thread, is: thread } }, system).value
  return (Array.isArray(read) ? read.filter(isStored) : []).sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))
}

/** The turns of rows: a `user` row and the rows after it up to the next one. A summary row belongs to no turn. */
function turnsOf(rows: Record<string, unknown>[]): Record<string, unknown>[][] {
  const turns: Record<string, unknown>[][] = []
  for (const row of rows) {
    if (row.who === 'summary') continue
    if (row.who === 'user' || !turns.length) turns.push([row])
    else turns[turns.length - 1].push(row)
  }
  return turns
}

/**
 * What is sent of a conversation, by its memory: with `'all'` every row; with `'drop'` the latest `keep` turns;
 * with a summary the latest summary and every row after the one it covers last. Answers too the rows that a
 * summary is due over, where one is: the turns after the latest summary, the new one among them, number more
 * than `keep` and `after` together, and all of them but the latest `keep` are shortened.
 */
function sentOf(
  memory: MemoryOf,
  rows: Record<string, unknown>[],
): { sent: Record<string, unknown>[]; due?: Record<string, unknown>[] } {
  if (memory.shrink === 'all') return { sent: rows }
  if (memory.shrink === 'drop' || memory.shrink === 'nearest') return { sent: turnsOf(rows).slice(-memory.keep).flat() }
  const summaries = rows.filter((row) => row.who === 'summary')
  const latest = summaries.at(-1)
  const upTo: unknown = Reflect.get(Object(latest?.data), 'upTo')
  const after =
    typeof upTo === 'string'
      ? rows.filter((row) => String(row.id) > upTo && row.who !== 'summary')
      : rows.filter((row) => row.who !== 'summary')
  const sent = [...(latest ? [latest] : []), ...after]
  const turns = turnsOf(after)
  if (turns.length <= memory.keep + memory.after) return { sent }
  const due = [...(latest ? [latest] : []), ...turns.slice(0, turns.length - memory.keep).flat()]
  return { sent, due }
}

/** The ids of the rows of a conversation that are sent in full, by the agent's memory. */
export function sentIds(o: Opened, memory: MemoryOf, thread: string): Set<string> {
  return new Set(sentOf(memory, rowsOf(o, memory, thread)).sent.map((row) => String(row.id)))
}

/**
 * Takes the ids of rows of a conversation, nearest first, and a count. Answers the ids of every row of the turns
 * they stand in, so many turns of them at most, taken in the order of the ids it was handed.
 */
export function turnIdsOf(o: Opened, memory: MemoryOf, thread: string, ids: string[], most: number): string[] {
  const turns = turnsOf(rowsOf(o, memory, thread))
  const chosen: Record<string, unknown>[][] = []
  for (const id of ids) {
    if (chosen.length >= most) break
    const turn = turns.find((one) => one.some((row) => String(row.id) === id))
    if (turn && !chosen.includes(turn)) chosen.push(turn)
  }
  return chosen.flat().map((row) => String(row.id))
}

/** The files a row names: those of a message of the person, and the pictures and sounds of a tool's answer. */
function filesNamed(row: Record<string, unknown>): string[] {
  const files: unknown = Reflect.get(Object(row.data), 'files')
  return (Array.isArray(files) ? files : []).map((one) => (isStored(one) ? String(one.id) : String(one)))
}

/** A row as it is sent: each file it names read as the system, an image as its bytes and any other file as its words. */
async function recalled(o: Opened, row: Record<string, unknown>): Promise<Recalled> {
  const files: NonNullable<Recalled['files']> = []
  for (const id of filesNamed(row)) {
    const file = fileRow(o, id)
    if (!file || file.removedAt !== undefined) continue
    const image = file.kind.startsWith('image/')
    files.push({
      id,
      name: file.name,
      kind: file.kind,
      ...(image ? { image: await wholeBytes(o, file) } : { words: await textOf(o, file) }),
    })
  }
  return {
    id: String(row.id),
    who: String(row.who),
    ...(typeof row.text === 'string' ? { text: row.text } : {}),
    ...(row.data === undefined || row.data === null ? {} : { data: row.data }),
    ...(files.length ? { files } : {}),
  }
}

/**
 * `_t_memoryRead({ agent, thread, nearest? })`: the rows of a conversation that are sent, by the agent's
 * memory, in the order they were added, each file of them read, with the older rows that `nearest` names among
 * them; and where a summary is due, the rows it is written of, as `due`. It takes the starter from the call context
 * and checks first that the starter may open the conversation (T2103). It writes nothing.
 */
export async function memoryRead(cx: CallContext, given: unknown): Promise<{ rows: Recalled[]; due?: Recalled[] }> {
  const o = cx.app
  const asked: Record<string, unknown> = isStored(given) ? given : {}
  const memory = memoryOf(o, String(asked.agent))
  const thread = String(asked.thread)
  mayOpen(o, memory, thread, cx.caller)
  const all = rowsOf(o, memory, thread)
  const { sent: latest, due } = sentOf(memory, all)
  const named = new Set([
    ...latest.map((row) => String(row.id)),
    ...(memory.shrink === 'nearest' && Array.isArray(asked.nearest) ? asked.nearest.map(String) : []),
  ])
  const sent = memory.shrink === 'nearest' ? all.filter((row) => named.has(String(row.id))) : latest
  const rows = await Promise.all(sent.map((row) => recalled(o, row)))
  return { rows, ...(due ? { due: await Promise.all(due.map((row) => recalled(o, row))) } : {}) }
}

/** Has a row hold each file it names, as a `file` column would: the file is kept, and loose no more. */
function holdNamed(o: Opened, tx: Tx, table: string, row: Record<string, unknown>): void {
  for (const id of filesNamed(row)) {
    const file = fileRow(o, id, tx)
    if (!file) continue
    const key = { file: id, tableName: table, rowId: String(row.id), column: 'data', keptAt: '' }
    if (tx.read({ from: holdsTable.name, one: 'get', id: key }, system) === undefined)
      tx.add(holdsTable.name, key, system)
    if (file.looseAt !== undefined) tx.change(filesTable.name, id, { looseAt: null }, system)
  }
}

/**
 * `_t_memoryAdd({ agent, thread, run, rows })`: adds the rows to the conversation in one write, each with its
 * run and the conversation's value, the starter in the owner column where the starter is a user and the row is no
 * summary, and each file a row names held by it. It takes the starter from the call context and checks first that
 * the starter may open the conversation (T2103). Inside a step it carries the once-only key of its place, so a step
 * that runs twice adds its rows once. Answers the ids of the rows.
 */
export function memoryAdd(cx: CallContext, given: unknown): { rows: string[] } {
  const o = cx.app
  const asked: Record<string, unknown> = isStored(given) ? given : {}
  const memory = memoryOf(o, String(asked.agent))
  const thread = String(asked.thread)
  mayOpen(o, memory, thread, cx.caller)
  const at = cx.run?.step ? atOf(cx) : undefined
  const key = at ? onceKey(at, whichCall(cx, '_t_memoryAdd', given)) : undefined
  const user = cx.caller.user?.id
  const rows = (Array.isArray(asked.rows) ? asked.rows : []).filter(isStored)
  const { value } = o.store.write((tx) => {
    const held: unknown = key ? tx.read({ from: onceTable.name, one: 'get', id: stepKey(key) }, system) : undefined
    const kept: unknown = Reflect.get(Object(Reflect.get(Object(held), 'result')), 'rows')
    if (Array.isArray(kept)) return kept.map(String)
    const ids: string[] = []
    for (const row of rows) {
      const added = tx.add(
        memory.table,
        {
          who: row.who,
          ...(typeof row.text === 'string' ? { text: row.text } : {}),
          ...(row.data === undefined ? {} : { data: row.data }),
          ...(typeof asked.run === 'string' ? { run: asked.run } : {}),
          [memory.thread]: thread,
          ...(memory.owner && user && row.who !== 'summary' ? { [memory.owner]: user } : {}),
        },
        system,
      )
      holdNamed(o, tx, memory.table, added)
      ids.push(String(added.id))
    }
    if (key && at) tx.add(onceTable.name, stepRowOf(o, key, at.run, { rows: ids }), system)
    return ids
  })
  return { rows: value }
}
