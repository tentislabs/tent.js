import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { CallContext } from '../context.ts'
import { dbFor } from '../program.ts'
import type { MemoryOf } from './memory.ts'
import { mayOpen, memoryOf, sentIds, turnIdsOf } from './memory.ts'
import { isStored } from '../../core/internal.ts'

const system: Caller = { kind: 'system' }

/** The vector column of a memory table that the engine fills from the text of a message, with its model. */
function meaningOf(cx: CallContext, table: string): { column: string; model: string } | undefined {
  const stored = Object.hasOwn(cx.app.description.tables, table) ? cx.app.description.tables[table] : undefined
  for (const [column, type] of Object.entries(isStored(stored?.columns) ? stored.columns : {})) {
    const by: unknown = isStored(type) ? type.by : undefined
    const columns: unknown = Reflect.get(Object(by), 'columns')
    if (isStored(type) && type.kind === 'vector' && typeof type.model === 'string' && Array.isArray(columns))
      if (columns.includes('text')) return { column, model: type.model }
  }
  return undefined
}

/** Calls a member of a value by its name, as a `db` of the engine gives one. */
const member = (value: unknown, name: string, args: unknown[]): unknown =>
  Reflect.apply(Object(Reflect.get(Object(value), name)), value, args)

/** The rows of the memory table that a filter holds, nearest to a vector first, read as a caller under the table's rule. */
function nearestRows(
  cx: CallContext,
  caller: Caller,
  memory: MemoryOf,
  column: string,
  filter: Record<string, unknown>,
  vector: unknown[],
  most: number,
): Record<string, unknown>[] {
  const of: unknown = Reflect.get(Object(dbFor(cx.app, caller)), memory.table)
  const plan = member(member(member(of, 'where', [filter]), 'near', [column, vector]), 'limit', [most])
  const found: unknown = member(plan, 'all', [])
  return (Array.isArray(found) ? found : []).filter(isStored)
}

/**
 * `_t_recall({ agent, thread, text })`: what the memory of an agent brings back by meaning, nearest to the
 * text. `rows`: as `memory.recall` asks, so many older messages of every conversation the starter may read, by
 * `near` under the table's rule and held to the rows the starter owns, past the rows that are sent in full, each as
 * `{ who, text }`. `nearest`: as `shrink: { nearest }` asks, the ids of the rows of so many older turns of this
 * conversation, which are sent beside the latest. The text is turned into a vector once, by the model of the
 * table's vector column, as a model call of the starter. Throws T7007 for a table with no vector column filled from
 * `text`.
 */
export async function recalled(
  cx: CallContext,
  given: unknown,
): Promise<{ rows: { who: string; text: string }[]; nearest: string[] }> {
  const o = cx.app
  const asked: Record<string, unknown> = isStored(given) ? given : {}
  const name = String(asked.agent)
  const thread = String(asked.thread)
  const memory = memoryOf(o, name)
  mayOpen(o, memory, thread, cx.caller)
  const recall: unknown = Reflect.get(Object(Reflect.get(Object(o.description.flows[name]?.agent), 'memory')), 'recall')
  const limit = typeof recall === 'number' ? recall : 0
  const turns = memory.nearest ?? 0
  const meaning = meaningOf(cx, memory.table)
  if (!meaning)
    throw new TentError(
      'T7007',
      `The memory table ${memory.table} of ${name} has no vector column filled from \`text\`.`,
      {
        fix: "Give the table a column `vector({ size, model, by: 'text' })`, which the engine fills from each message.",
      },
    )
  const { callModel } = await import('./call.ts')
  const vector: unknown = await callModel(cx, `${meaning.model}.embed`, [String(asked.text ?? '')])
  if (!Array.isArray(vector)) return { rows: [], nearest: [] }
  const sent = sentIds(o, memory, thread)
  // The turns of the conversation itself are its own: it is one thing, read as the system once it may be opened.
  const near = turns
    ? nearestRows(cx, system, memory, meaning.column, { [memory.thread]: thread }, vector, (turns + sent.size) * 4)
        .filter((row) => !sent.has(String(row.id)) && row.who !== 'summary')
        .map((row) => String(row.id))
    : []
  // Recall never crosses starters: a starter who is no user has no rows of their own to recall.
  const user = cx.caller.user?.id
  const rows =
    limit && user && memory.owner
      ? nearestRows(cx, cx.caller, memory, meaning.column, { [memory.owner]: user }, vector, limit + sent.size)
          .filter((row) => !sent.has(String(row.id)) && typeof row.text === 'string' && row.who !== 'summary')
          .slice(0, limit)
          .map((row) => ({ who: String(row.who), text: String(row.text) }))
      : []
  return { rows, nearest: turnIdsOf(o, memory, thread, near, turns) }
}
