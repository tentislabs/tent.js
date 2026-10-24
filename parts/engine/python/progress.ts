import { lstatSync } from 'node:fs'
import { TentError } from '../../core/index.ts'
import { isStored, limitDefaults } from '../../core/internal.ts'
import type { CallContext } from '../context.ts'
import { atOf, onceKey, whichCall } from '../flows/inside.ts'
import { stepRowOf } from '../flows/once.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { keptFile, keptGone } from '../stored/keptFile.ts'
import { stepKey, table } from '../tables/once.ts'
import type { ProgressKept } from '../stored/keptProgress.ts'
import { progressKeptOf, progressIn } from '../stored/keptProgress.ts'
import { copyInFolder, insideFolder, storedFromFolder } from './values.ts'

const system = { kind: 'system' } as const

/** What a call of a `python` keeps of where it is, and how it keeps a new value. */
export interface Progress {
  // The last kept value, with each file it named laid as a copy in the folder of this call and named by its path.
  handedIn(folder: string): Promise<unknown>
  keep(value: unknown, folder: string): Promise<void>
}

/** Each text of a value, at any depth. */
function textsOf(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') into.add(value)
  else if (Array.isArray(value)) for (const one of value) textsOf(one, into)
  else if (isStored(value)) for (const one of Object.values(value)) textsOf(one, into)
  return into
}

/** A value with each text that is a key of `swap` put by what it names. */
function swapped(value: unknown, swap: Map<string, string>): unknown {
  if (typeof value === 'string') return swap.get(value) ?? value
  if (Array.isArray(value)) return value.map((one) => swapped(one, swap))
  if (isStored(value)) return Object.fromEntries(Object.entries(value).map(([key, one]) => [key, swapped(one, swap)]))
  return value
}

/** `limits.result` of a flow of the app by its name, in bytes: what it states, or its default. */
function resultLimit(o: Opened, flow: string): number {
  const record = Object.hasOwn(o.description.flows, flow) ? o.description.flows[flow] : undefined
  const stated: unknown = Reflect.get(Object(record?.limits), 'result')
  return typeof stated === 'number' ? stated : Number(limitDefaults.flow.result)
}

/**
 * Takes an app, the call context of a call of a `python`, its name, its input, and what its `run` was handed.
 * Answers how the call keeps its progress: work of a task or of a thread, which is a run of one step, keeps it in
 * the row of its step through what it was handed; a call inside a step keeps it under the once-only key of the
 * call, in `_t_once`, so the step that is made again after a restart is handed it. A plain file of the folder of
 * the call that the value names by its path is stored with it, and handed again as a copy in the folder of the
 * call that is handed the value. Outside a step nothing is kept, and nothing is answered.
 */
export function progressOf(
  o: Opened,
  cx: CallContext,
  name: string,
  input: unknown,
  handed: Record<string, unknown>,
): Progress | undefined {
  const at = cx.run?.step ? atOf(cx) : undefined
  const most = resultLimit(o, at?.flow ?? cx.work.name)
  const fileMost = storedLimit(o.description, 'uploadSize')
  const held = async (value: unknown, folder: string): Promise<ProgressKept> => {
    const size = Buffer.byteLength(JSON.stringify(value) ?? '')
    if (size > most)
      throw new TentError('T5102', `${name} kept a progress of ${size} bytes, past \`limits.result\` of ${most}.`, {
        fix: 'Keep where the work is in a small value, and what is large in a file that the value names.',
      })
    const files: Record<string, string> = {}
    for (const text of textsOf(value)) {
      if (!insideFolder(text, folder)) continue
      const found = lstatSync(text)
      if (found.isFile() && found.size <= fileMost) files[text] = await storedFromFolder(o, cx, text)
    }
    return { value: value ?? null, files }
  }
  // A copy of each file of a progress, read as `by` may read it.
  const handedIn = async (kept: ProgressKept | undefined, folder: string, by: CallContext): Promise<unknown> => {
    if (!kept) return null
    const swap = new Map<string, string>()
    for (const [path, id] of Object.entries(kept.files)) swap.set(path, await copyInFolder(o, by, id, folder))
    return swapped(kept.value, swap)
  }
  const progress: unknown = handed.progress
  if (typeof progress === 'function')
    return {
      handedIn: (folder) => handedIn(progressKeptOf(progress()), folder, cx),
      keep: async (value, folder) => void (await progress(await held(value, folder))),
    }
  if (!at) return undefined
  const key = onceKey(at, whichCall(cx, `python:${name}`, input))
  const stored: unknown = o.store.read({ from: table.name, one: 'get', id: stepKey(key) }, system).value
  // The files of this progress are the engine's own, kept for this call alone: they are read as the system.
  const own: CallContext = { ...cx, caller: system }
  return {
    handedIn: (folder) => handedIn(progressIn(stored), folder, own),
    keep: async (value, folder) => {
      const loose = await held(value, folder)
      o.machine.writes(`the progress of ${name}`)
      o.store.write((tx) => {
        const there: unknown = tx.read({ from: table.name, one: 'get', id: stepKey(key) }, system)
        // Each file is kept as a file of the engine's own for as long as its progress: the one before lets go of its.
        keptGone(tx, Object.values(progressIn(there)?.files ?? {}), o.clock.now())
        const files = Object.entries(loose.files).flatMap(([path, id]) => {
          const kept = keptFile(tx, id)
          return kept === undefined ? [] : [[path, kept]]
        })
        const result = { progress: { value: loose.value, files: Object.fromEntries(files) } }
        if (there !== undefined && there !== null) tx.change(table.name, stepKey(key), { result }, system)
        else tx.add(table.name, stepRowOf(o, key, at.run, result), system)
      })
    },
  }
}
