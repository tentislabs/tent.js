import { AsyncLocalStorage } from 'node:async_hooks'
import type { Store } from '../../data/index.ts'
import type { CallContext } from '../context.ts'
import { fileOfRun } from '../flows/fileOf.ts'
import { atOf, onceKey, whichCall } from '../flows/inside.ts'
import { stepRowOf } from '../flows/once.ts'
import type { Opened } from '../opened.ts'
import { stepKey, table } from '../tables/once.ts'

const system = { kind: 'system' } as const

// The once-only key of the model call that is being made, and its run: where a step keeps what the call hands it.
const keys = new AsyncLocalStorage<{ key: string; run: string } | undefined>()

/**
 * Takes the call context of a model call, the name it is called by, and its input. Answers the once-only key of
 * its place where it is made inside a step, and nothing outside one: which call of its step it is is counted here,
 * once, as the call is made.
 */
export function keyOfCall(cx: CallContext, name: string, input: unknown): { key: string; run: string } | undefined {
  const at = cx.run?.step ? atOf(cx) : undefined
  return at ? { key: onceKey(at, whichCall(cx, name, input)), run: at.run } : undefined
}

/** Carries a model call out with the once-only key of its place, which `kept` and `keep` read. */
export const withKey = <T>(key: { key: string; run: string } | undefined, work: () => T): T => keys.run(key, work)

/** The store that a run keeps what it keeps in: the file of its tenant, or the shared one. */
function storeOf(o: Opened, run: string): Store {
  const file = o.files ? fileOfRun(run) : undefined
  return (file ? o.files?.of(file) : undefined) ?? o.store
}

/** What a step keeps for the model call that is being made, or nothing outside a step. */
export function keptNow(o: Opened): unknown {
  const held = keys.getStore()
  if (!held) return undefined
  const store = storeOf(o, held.run)
  if (!store.layout().some((one) => one.name === table.name)) return undefined
  const row: unknown = store.read({ from: table.name, one: 'get', id: stepKey(held.key) }, system).value
  return row !== undefined && row !== null ? Reflect.get(Object(row), 'result') : undefined
}

/** Keeps what a model call hands the engine, under its once-only key, in a write of its own. Outside a step nothing is kept. */
export function keepNow(o: Opened, value: unknown): void {
  const held = keys.getStore()
  if (!held) return
  const row = stepRowOf(o, held.key, held.run, value ?? null)
  storeOf(o, held.run).write((tx) => {
    const there: unknown = tx.read({ from: table.name, one: 'get', id: stepKey(held.key) }, system)
    if (there !== undefined && there !== null) tx.change(table.name, stepKey(held.key), { result: row.result }, system)
    else tx.add(table.name, row, system)
  })
}
