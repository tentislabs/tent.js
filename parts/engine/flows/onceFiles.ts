import type { FileName, Files, Store } from '../../data/index.ts'
import type { At } from '../../flows/index.ts'
import type { CallContext, Written } from '../context.ts'
import type { Opened } from '../opened.ts'
import { stepKey, table } from '../tables/once.ts'
import { fileOfRun } from './fileOf.ts'
import { stepRowOf } from './once.ts'
import { fileOfWrite } from './openWrite.ts'
import { byOf } from '../byWhom.ts'

const system = { kind: 'system' } as const

/** The first answer that a key was kept with in a store, where the store holds it. */
function heldIn(store: Store | undefined, key: string): { answer: unknown } | undefined {
  if (!store?.layout().some((one) => one.name === table.name)) return undefined
  const held: unknown = store.read({ from: table.name, one: 'get', id: stepKey(key) }, system).value
  return held !== undefined && held !== null ? { answer: Reflect.get(Object(held), 'result') } : undefined
}

// What undoes the write of a change whose key was kept already: the first answer travels with it.
class Kept {
  answer: unknown
  constructor(answer: unknown) {
    this.answer = answer
  }
}

/**
 * A change that a step calls in an app that keeps a data file for each tenant is carried out once for its key.
 * The key is looked up in the file of the run first. Otherwise the change is run, and the key is looked up inside
 * its write, in the file that the write is of: a hit undoes the write and answers the first answer. The row of the
 * key stands in the file the change wrote, and in the file of the run where that is another, so that a second
 * making finds it before it runs. A call that wrote nothing keeps its row in the file of the run.
 */
export function onceInFiles(
  o: Opened,
  files: Files,
  cx: CallContext,
  key: string,
  at: At,
  carry: (parent: CallContext) => unknown,
): { value: unknown; again: boolean; written: Written } {
  const runFile = fileOfRun(at.run)
  const written: Written = { rows: [], done: [] }
  const first = heldIn(runFile ? files.of(runFile) : files.shared, key)
  if (first) return { value: first.answer, again: true, written }
  let wroteIn: FileName | undefined
  let answer: unknown
  try {
    files.write((w) => {
      answer = carry({ ...cx, writing: w, written })
      // The file that the rows of the change named; of a change that wrote no row of a tenant, the shared file, and of one that wrote nothing at all, the file of the run.
      wroteIn = fileOfWrite(w) ?? (written.rows.length ? undefined : runFile)
      const tx = w.tx(wroteIn)
      const held: unknown = tx.read({ from: table.name, one: 'get', id: stepKey(key) }, system)
      if (held !== undefined && held !== null) throw new Kept(Reflect.get(Object(held), 'result'))
      tx.add(table.name, stepRowOf(o, key, at.run, answer), system)
      o.machine.writes(cx.work.name)
    }, byOf(cx))
  } catch (error) {
    if (error instanceof Kept) return { value: error.answer, again: true, written }
    throw error
  }
  // The file of the run notes the key too, so that a second making finds it before it runs.
  const same = (wroteIn ? `${wroteIn.table} ${wroteIn.id}` : '') === (runFile ? `${runFile.table} ${runFile.id}` : '')
  if (!same)
    (runFile ? files.of(runFile) : files.shared)?.write((tx) =>
      tx.add(table.name, stepRowOf(o, key, at.run, answer), system),
    )
  return { value: answer, again: false, written }
}
