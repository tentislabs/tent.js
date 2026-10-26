import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../../core/index.ts'
import { isStored, locksOf } from '../../core/internal.ts'
import type { CallContext } from '../context.ts'
import { underWay } from '../context.ts'
import { resolveWith } from '../door/carry.ts'
import { endsAt } from '../endsAt.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { partsOf } from '../parts.ts'
import { valuesOf } from '../values/ofApp.ts'
import { pythonAnswered } from './answered.ts'
import { environmentOf } from './environment.ts'
import { endedOf, pythonFailureOf } from './failures.ts'
import { callsFolder, callUnderWay } from './folders.ts'
import { lockText } from './locks.ts'
import type { PythonProgram } from './program.ts'
import { poolOf, programsOf } from './programs.ts'
import { progressOf } from './progress.ts'
import { rowsFile } from './rows.ts'
import { copyInFolder, pythonInputFor, outputOf } from './values.ts'
import { holdsFile, textAt } from '../files.ts'
import { placedFolder } from '../placedFolders.ts'
import { noteOutside } from '../touched.ts'

// How deep a call stands inside calls of a `python` that called it through `tent.call`.
const depth = new AsyncLocalStorage<number>()

/** The number of a stored limit of a definition, or what holds where it states none. */
const limitOf = (record: Record<string, unknown>, name: string, otherwise: number): number => {
  const stated: unknown = Reflect.get(Object(record.limits), name)
  return typeof stated === 'number' ? stated : otherwise
}

/** Takes a wait out of the time of a call: its end is moved by the most it may take, and back by what it did not. */
async function outOfTime<T>(cx: CallContext, most: number, work: () => Promise<T>): Promise<T> {
  const began = performance.now()
  cx.work.ends += most
  try {
    return await work()
  } finally {
    cx.work.ends -= Math.max(0, most - (performance.now() - began))
  }
}

/**
 * Takes the app of a version and the record of a `python`. Answers the name of its lock, with the environment of
 * the lock made where it is not there yet, from the lock that the bundle holds. Throws T7020 for a bundle that
 * holds no lock of it, and T0016.
 */
export async function environmentFor(o: Opened, record: Record<string, unknown>): Promise<string> {
  const lock = String(Reflect.get(Object(record.python), 'lock') ?? '')
  const of = locksOf(o.description).find((one) => one.lock === lock)
  const read = (file: string): string | undefined =>
    holdsFile(o.bundle, `python/${file}`) ? textAt(o.bundle, `python/${file}`) : undefined
  const text = of ? lockText(o.description, of, read) : undefined
  if (text === undefined)
    throw new TentError('T7020', `The bundle holds no ${of?.file ?? 'lock'} of this python.`, {
      fix: 'Run `tent python lock`, and build the project again.',
    })
  const env = await environmentOf({
    lock: text,
    stated: Object(o.description.project.python),
    parts: { ...partsOf(o), mode: o.mode },
    secret: (name) => valuesOf(o).secrets.value(name),
    time: storedLimit(o.description, 'pythonInstall'),
    program: (start) => o.room.program(start),
  })
  programsOf(o).environments.set(lock, env)
  return lock
}

/**
 * Takes the app, the call context, the record of a `python`, what one entry of its call was handed, and the folder
 * of the entry. Answers the entry as Python is handed it: its input, with a copy of each file of it laid in the
 * folder, the folder, and the path of its rows file, where the definition states `rows`.
 */
async function laidOf(
  o: Opened,
  cx: CallContext,
  record: Record<string, unknown>,
  handed: Record<string, unknown>,
  folder: string,
): Promise<Record<string, unknown>> {
  mkdirSync(folder, { recursive: true })
  const input = await pythonInputFor({ kind: 'object', shape: record.input }, handed.input ?? {}, (id) =>
    copyInFolder(o, cx, id, folder),
  )
  const plans: unknown = record.rows
  // A definition that states `system` reads with full access, which is `db.system` in code: `db` stays limited.
  const db: unknown = typeof record.system === 'string' ? Reflect.get(Object(handed.db), 'system') : handed.db
  // The rows of a task on a worker were read by its writer, and are handed in their place.
  const given: unknown = handed.rows
  if (!isStored(plans) || !Object.keys(plans).length) return { input, folder }
  const rows = await rowsFile(
    o.description,
    plans,
    async (plan, entry) =>
      isStored(given) && Object.hasOwn(given, entry)
        ? given[entry]
        : Reflect.apply(Reflect.get(Object(db), 'read'), db, [plan, resolveWith(cx, Object(handed.input))]),
    folder,
  )
  return { input, folder, rows }
}

/** Loads the file of a definition into a program, held to the time of the loading. Throws T7119 and T0008. */
export function loaded(program: PythonProgram, name: string, file: string, root: string, time: number): Promise<void> {
  const id = `load:${file}`
  return new Promise((done, failed) => {
    const timer = setTimeout(() => {
      program.off(id)
      program.end()
      failed(
        new TentError('T0008', `${name} took longer to load than its \`limits.load\` of ${time} ms.`, {
          fix: 'Give the definition a larger `limits.load`, or `limits.pythonLoad` of the project.',
        }),
      )
    }, time)
    program.on(id, (frame) => {
      clearTimeout(timer)
      program.off(id)
      if (frame.t === 'loaded') {
        program.loaded.add(file)
        return done()
      }
      if (frame.t === 'ended') return failed(endedOf(name, String(frame.why ?? '')))
      failed(pythonFailureOf(name, frame.error, new Map(), {}))
    })
    program.send({ t: 'load', load: id, file, root })
  })
}

/**
 * Takes the app of a version, the name of a `python`, its record and what its `run` was handed. Carries the call
 * out in a Python program of the app: makes the environment of its lock where it is not there, waits for a place
 * in a program, loads the file of the definition once, lays the files of the input and the rows file in the folder
 * of the call, hands the call over, answers what Python asks for it, and turns what Python answered into the
 * output. Neither the wait for the environment, nor the start of a program, nor the loading counts on the time of
 * the call, which is `limits.time` of the definition: past it the Python program is ended, and the call is T0008.
 * Throws T7119, the app's own failure, T0013, T5105, T0008, T0016, T7020, and whatever a call that Python made let
 * out.
 */
export async function carriedPython(
  o: Opened,
  name: string,
  record: Record<string, unknown>,
  handed: Record<string, unknown>,
): Promise<unknown> {
  const cx = underWay()
  if (!cx) throw new TentError('T0013', `${name} is a python, which is carried out inside a call.`)
  // Under `tent test`, a Python program stands outside the record and the held clock of a test: it is never replayed.
  noteOutside(`python ${name}`)
  const deep = depth.getStore() ?? 0
  const deepest = storedLimit(o.description, 'callDepth')
  if (deep >= deepest)
    throw new TentError(
      'T5105',
      `${name} was called by Python ${deep} deep, past \`limits.callDepth\` of ${deepest}.`,
      {
        fix: 'Python code that calls back must come to an end. Where it does, raise `callDepth` in `project.limits`.',
      },
    )
  const time = limitOf(record, 'time', 30_000)
  cx.work.ends = Math.min(cx.work.ends, performance.now() + time)
  const held: { program?: PythonProgram } = {}
  // The end of the call moves while it waits for its environment and its loading: the timer follows it.
  const { timeUp, cancel } = endsAt(cx.work, () => {
    held.program?.end()
    return new TentError('T0008', `${name} took longer than its \`limits.time\` of ${time} ms.`, {
      fix: 'Give the definition a larger `limits.time`, or let it do less in one call.',
    })
  })
  const work = inProgram(o, cx, name, record, handed, deep, held)
  // What the work does after its time is up is no answer: its failure then is told to nobody.
  work.catch(() => undefined)
  try {
    return await Promise.race([work, timeUp])
  } finally {
    cancel()
  }
}

/** Carries a call of a `python` out in a Python program of the app, as `carriedPython` says, and names the program in `held`. */
async function inProgram(
  o: Opened,
  cx: CallContext,
  name: string,
  record: Record<string, unknown>,
  handed: Record<string, unknown>,
  deep: number,
  held: { program?: PythonProgram },
): Promise<unknown> {
  const stated = Object(record.python)
  const file = String(stated.file)
  const lock = await outOfTime(cx, storedLimit(o.description, 'pythonInstall'), () => environmentFor(o, record))
  const loading = limitOf(record, 'load', storedLimit(o.description, 'pythonLoad'))
  const place = await poolOf(o).place({
    kind: { version: o.version, lock, gpu: stated.gpu === true },
    file,
    atOnce: typeof stated.atOnce === 'number' ? stated.atOnce : 1,
    inside: deep > 0,
    until: cx.work.ends,
    name,
    // Starting a Python program is a piece of the loading: it counts on no call.
    starting: (work) => outOfTime(cx, loading, work),
  })
  const { program } = place
  held.program = program
  const call = randomBytes(8).toString('hex')
  const folder = join(callsFolder(o.dataFolder), call)
  const holding = callUnderWay(folder)
  const ended = (): void => program.end()
  cx.signal.addEventListener('abort', ended)
  try {
    // A signal that ended while the call waited for its environment and its place tells no listener any more.
    cx.signal.throwIfAborted()
    // A Python program reads the files of the version by their places: a list of development is laid out for it.
    const root = placedFolder(o.bundle, 'python')
    if (!program.loaded.has(file)) await outOfTime(cx, loading, () => loaded(program, name, file, root, loading))
    mkdirSync(folder, { recursive: true })
    const disk = join(o.dataFolder, 'disk')
    mkdirSync(disk, { recursive: true })
    // A batch is handed its entries, each with its input, its rows and its folder; any other call its own.
    const entries: unknown = handed.entries
    const batch = Array.isArray(entries)
    const laid = await Promise.all(
      (batch ? entries : [handed]).map((entry, at) =>
        laidOf(o, cx, record, Object(entry), batch ? join(folder, String(at)) : folder),
      ),
    )
    const progress = progressOf(o, cx, name, handed.input, handed)
    const value = await pythonAnswered(o, cx, {
      name,
      record,
      handed,
      program,
      progress,
      deeper: (work) => depth.run(deep + 1, work),
      frame: {
        t: 'call',
        call,
        file,
        root,
        folder,
        disk,
        ...(batch ? { batch: true, entries: laid } : laid[0]),
        memory: limitOf(record, 'memory', 1_073_741_824),
        step: progress !== undefined,
        progress: progress ? await progress.handedIn(folder) : null,
      },
    })
    if (!batch || !Array.isArray(value)) return await outputOf(o, cx, name, record.output, value, folder)
    // An entry that failed is its error, which fails that entry alone.
    return await Promise.all(
      value.map((one, at) =>
        one instanceof Error ? one : outputOf(o, cx, name, record.output, one, join(folder, String(at))),
      ),
    )
  } finally {
    cx.signal.removeEventListener('abort', ended)
    program.off(call)
    place.release()
    holding.done()
    try {
      rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // A file that Python still holds open keeps it on Windows: what is left is removed when the engine starts.
    }
  }
}
