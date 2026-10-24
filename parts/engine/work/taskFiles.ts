import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { progressKeptOf } from '../stored/keptProgress.ts'
import { mayDownload } from '../stored/access.ts'
import { fileRow, forgetFile, putFile, streamOf, wholeBytes } from '../stored/files.ts'
import { keptBack, keptFile, keptGone } from '../stored/keptFile.ts'
import { table as filesTable } from '../tables/files.ts'
import type { OutTask } from './state.ts'

const system = { kind: 'system' } as const

/**
 * Takes an app, a task that is out, and a value. Answers the value as a frame may carry it: itself where its JSON
 * stays under `limits.inFrame`, and otherwise `{ file }`, the fingerprint of a file that the writer made of it, which
 * belongs to nobody but the writer, is noted for that task alone, and is removed when the task has ended.
 */
export async function framed(o: Opened, out: OutTask, value: unknown): Promise<{ value: unknown } | { file: string }> {
  const text = JSON.stringify(value ?? null)
  if (text.length <= storedLimit(o.description, 'inFrame')) return { value }
  const made = await putFile(o, streamOf(text), { name: 'carried.json', kind: 'application/json', by: 'system' })
  out.files = [...(out.files ?? []), made.fingerprint]
  out.made = [...(out.made ?? []), made.id]
  return { file: made.fingerprint }
}

/** Reads back a value that a worker posted as a file with `carry`, and removes that file. */
export async function carried(o: Opened, out: OutTask, id: unknown): Promise<unknown> {
  const file = fileRow(o, id)
  if (!file || !out.carried?.includes(file.id))
    throw new TentError('T5108', 'The file that the message names was not posted for this task.')
  const value: unknown = JSON.parse(new TextDecoder().decode(await wholeBytes(o, file)))
  await forgetFile(o, file).catch(() => undefined)
  return value
}

/** Whether every file that a progress names is one that its task posted, or one that the caller of the task may download. */
export function holdsFiles(o: Opened, out: OutTask, caller: Caller, ids: string[]): boolean {
  return ids.every((id) => {
    if (out.posted?.includes(id)) return true
    const file = fileRow(o, id)
    return file !== undefined && mayDownload(o, caller, file)
  })
}

/** Removes the files that the writer made to carry rows and answers to a task that has ended. */
export async function forgetMade(o: Opened, out: OutTask | undefined): Promise<void> {
  for (const id of [...(out?.made ?? []), ...(out?.carried ?? [])]) {
    const file = fileRow(o, id)
    if (file) await forgetFile(o, file).catch(() => undefined)
  }
}

/** What the files of a progress that a task kept were made into: the value to keep, its kept files, and those before. */
export interface KeptOfTask {
  value: unknown
  made: string[]
  before: string[]
}

/**
 * Takes an app, a task that is out, the id of its run, and the value of a progress it kept. In one write, keeps
 * each file that the value names by its path, as a `python` keeps a progress, and that the task posted, as a file
 * of the engine's own for the run, and lets go of the files of the progress before. Answers the value with each
 * such file named by the file that keeps it, which the worker of the step may read by its id.
 */
export function keptOfTask(o: Opened, out: OutTask, run: string, value: unknown): KeptOfTask {
  const progressed = progressKeptOf(value)
  const posted = Object.entries(progressed?.files ?? {}).filter(([, file]) => out.posted?.includes(file))
  const before = out.kept ?? []
  const swap: Record<string, string> = {}
  if (posted.length || before.length)
    o.store.write((tx) => {
      keptGone(tx, before, o.clock.now())
      for (const [path, file] of posted) {
        const kept = keptFile(tx, file, run)
        if (kept) swap[path] = kept
      }
    })
  out.kept = Object.values(swap)
  return {
    value: posted.length ? { ...Object(value), files: { ...progressed?.files, ...swap } } : value,
    made: Object.values(swap),
    before,
  }
}

/**
 * Takes an app, a run, and the value of the progress its step kept. Answers the files that the value names which
 * the engine keeps for that run and has not removed: what a task handed that progress may read, and lets go.
 */
export function keptOfRun(o: Opened, run: string, value: unknown): string[] {
  return Object.values(progressKeptOf(value)?.files ?? {}).filter((id) => {
    const row: unknown = o.store.read({ from: filesTable.name, one: 'get', id }, system).value
    const [by, of, removed] = ['by', 'run', 'removedAt'].map((name) => Reflect.get(Object(row), name))
    return by === 'system' && of === run && (removed === undefined || removed === null)
  })
}

/** Where the runner did not take a progress: the files kept for it go, and those of the progress before stand again. */
export function keptUndone(o: Opened, out: OutTask, kept: KeptOfTask): void {
  if (kept.made.length || kept.before.length)
    o.store.write((tx) => {
      keptGone(tx, kept.made, o.clock.now())
      keptBack(tx, kept.before)
    })
  out.kept = kept.before
}
