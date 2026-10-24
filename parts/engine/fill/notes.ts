import type { Store, Tx } from '../../data/index.ts'
import { metaTable } from '../../data/index.ts'
import { fingerprintOfText } from '../remember/keyOf.ts'
import { codePrint } from '../remember/keyOf.ts'
import type { Opened } from '../opened.ts'
import type { FilledColumn, FillGroup } from './columns.ts'
import { isStored } from '../../core/internal.ts'

const system = { kind: 'system' } as const

/** What the shared file keeps of the work of a filled column: the running one, and those that count as it. */
export interface Works {
  running: string
  // The work that stood at the last switch that changed it without `old: 'keep'`, and those after it under `keep`.
  base: string
  also: string[]
  // The moment of that switch: the values it made old became due then.
  at: number
}

/** A value of `_t_meta` of a store or of a write, or nothing. */
function noteOf(on: Store | Tx, key: string): unknown {
  const plan = { from: metaTable.name, one: 'get' as const, id: key }
  const row: unknown = 'write' in on ? on.read(plan, system).value : on.read(plan, system)
  return isStored(row) ? row.value : undefined
}

/** Writes one value of `_t_meta` inside a write, or takes it away where it is nothing. */
export function setNote(tx: Tx, key: string, value: unknown): void {
  const there = tx.read({ from: metaTable.name, one: 'get', id: key }, system) !== undefined
  if (value === undefined) {
    if (there) tx.remove(metaTable.name, key, system)
  } else if (there) tx.change(metaTable.name, key, { value }, system)
  else tx.add(metaTable.name, { key, value }, system)
}

/** Takes a filled column. Answers the key of `_t_meta` under which the shared file keeps its works. */
export const worksKey = (column: FilledColumn): string => `works.${column.table}.${column.column}`
/** The name of the walk of a filled column, for the rows that were there before it. */
export const walkName = (column: FilledColumn): string => `${column.table}.${column.column}`

/** The works of a filled column as the shared file keeps them, or nothing for a column it has not seen. */
export function worksOf(store: Store | Tx, column: FilledColumn): Works | undefined {
  const held = noteOf(store, worksKey(column))
  if (!isStored(held) || typeof held.running !== 'string' || typeof held.base !== 'string') return undefined
  return {
    running: held.running,
    base: held.base,
    also: Array.isArray(held.also) ? held.also.map(String) : [],
    at: typeof held.at === 'number' ? held.at : 0,
  }
}

/**
 * The fingerprint of what a value of a filled column rests on beside its row: the name of the definition, the
 * fingerprint of its code or its `version`, for a model its provider and its name, and `input` and `take` of the
 * `by`, which are the columns of a vector that its model makes. A new `debounce`, `tries`, `order`, `batch` or limit
 * makes no value old.
 */
export function workPrint(o: Opened, group: FillGroup, column: FilledColumn): string {
  const record: unknown = Object.hasOwn(o.description.functions, group.work) ? o.description.functions[group.work] : {}
  const model = Object.hasOwn(o.description.models, group.work) ? o.description.models[group.work] : undefined
  const code =
    group.version !== undefined
      ? `version:${group.version}`
      : model
        ? `model:${String(model.provider)}/${String(model.name)}`
        : codePrint(o, Object(record))
  return fingerprintOfText(JSON.stringify([group.work, code, group.input, column.take ?? null]))
}

/** Whether a value made under a work counts as made by the running one: that work, or one that `keep` holds the same. */
export const countsAsRunning = (works: Works | undefined, made: unknown): boolean =>
  works !== undefined && (made === works.base || works.also.includes(String(made)))
