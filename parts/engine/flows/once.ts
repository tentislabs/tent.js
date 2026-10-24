import type { Tx } from '../../data/index.ts'
import type { CallContext, Written } from '../context.ts'
import type { Opened } from '../opened.ts'
import { progressIn } from '../stored/keptProgress.ts'
import { keptGone } from '../stored/keptFile.ts'
import { stepKey, table } from '../tables/once.ts'
import { atOf, onceKey, whichCall } from './inside.ts'
import { onceInFiles } from './onceFiles.ts'
import { byOf } from '../byWhom.ts'

const system = { kind: 'system' } as const

/**
 * Takes an app, the once-only key of a call inside a step, its run, and what it answered. Answers the row of
 * `_t_once` that keeps it: under the caller `''`, with the answer as plain data, and no places counted yet.
 */
export function stepRowOf(o: Opened, key: string, run: string, answer: unknown): Record<string, unknown> {
  const result = answer === undefined ? undefined : JSON.parse(JSON.stringify(answer))
  return {
    caller: '',
    key,
    run,
    at: new Date(o.clock.now()),
    ...(result === undefined ? {} : { result }),
    places: {},
  }
}

/**
 * A change that is called inside a step is carried out once for its once-only key: its write holds one row of
 * `_t_once` with the key and what the change answered, and a repeat of the same call with the same input is
 * answered with that first answer, and writes nothing. Answers what the change answers, or nothing where the call
 * stands in no step, or is part of a write that is open already.
 */
export function onceIn(
  o: Opened,
  cx: CallContext,
  change: string,
  input: unknown,
  carry: (parent: CallContext) => unknown,
): { value: unknown } | undefined {
  const { functions } = cx.app.description
  const record = Object.hasOwn(functions, change) ? functions[change] : undefined
  const at = cx.run?.step && !cx.tx && !cx.writing ? atOf(cx) : undefined
  if (record?.kind !== 'change' || !at) return undefined
  const key = onceKey(at, whichCall(cx, change, input))
  o.machine.writes(change)
  if (o.files) {
    const kept = onceInFiles(o, o.files, cx, key, at, carry)
    if (!kept.again) told(o, kept.written)
    return { value: kept.value }
  }
  const written: Written = { rows: [], done: [] }
  const { value } = o.store.write((tx) => {
    const held: unknown = tx.read({ from: table.name, one: 'get', id: stepKey(key) }, system)
    if (held !== undefined && held !== null) return { answer: Reflect.get(Object(held), 'result'), again: true }
    const answer = carry({ ...cx, tx, written })
    tx.add(table.name, stepRowOf(o, key, at.run, answer), system)
    o.machine.writes(change)
    return { answer, again: false }
  }, byOf(cx))
  if (!value.again) told(o, written)
  return { value: value.answer }
}

/** Tells whoever listens each row and each change of a write that was committed. */
function told(o: Opened, written: Written): void {
  for (const row of written.rows) o.raise('row.changed', { app: o.app, ...row })
  for (const one of written.done) o.raise('change.done', { app: o.app, ...one })
}

/**
 * Removes what is kept of the calls of runs that are removed, inside the write that removes them, at a moment: the
 * files that the progress of a call kept go with it.
 */
export function forgetOnce(tx: Tx, runs: string[], at: number): void {
  for (const run of runs) {
    const rows: unknown = tx.read(
      { from: table.name, where: { col: 'run', is: run }, pick: ['caller', 'key', 'result'] },
      system,
    )
    for (const row of Array.isArray(rows) ? rows : []) {
      keptGone(tx, Object.values(progressIn(row)?.files ?? {}), at)
      tx.remove(table.name, { caller: String(Object(row).caller), key: String(Object(row).key) }, system)
    }
  }
}
