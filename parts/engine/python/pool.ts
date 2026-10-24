import { TentError } from '../../core/index.ts'
import type { PythonProgram } from './program.ts'

/** What a Python program belongs to: one version of the app, one lock, and one value of `gpu`. */
export interface ProgramKind {
  version: string
  lock: string
  gpu: boolean
}

/** A place in a Python program for one call, which is given back when the call has ended. */
interface Place {
  program: PythonProgram
  release(): void
}

/** The Python programs of one app, kept warm for its calls. */
export interface Pool {
  /**
   * Answers a place for a call of the file of a definition, in a program of its kind: one that holds calls of
   * that file alone and fewer than `atOnce` of them, or one that holds none. Where none is free and fewer than
   * `count` stand, a new one is started; a call made from inside a Python program is handed one beyond the count.
   * Otherwise the call waits for a place, up to the moment `until`, past which it is T0008. `starting` carries the
   * start of a new program, which the call may hold out of its time.
   */
  place(o: {
    kind: ProgramKind
    file: string
    atOnce: number
    inside: boolean
    until: number
    name: string
    starting?: <T>(work: () => Promise<T>) => Promise<T>
  }): Promise<Place>
  // Told the version that runs now: each program of another version ends once it holds no call.
  switched(version: string): void
  // The files of definitions that the programs of a version hold loaded.
  loaded(version: string): Set<string>
  // Ends every Python program of the app, with every program each started.
  close(): void
}

/** One Python program as the pool holds it, with what it holds. */
interface Held {
  kind: ProgramKind
  key: string
  program: PythonProgram
  // The calls it holds now, by the file of their definition.
  files: string[]
  beyond: boolean
  idle?: NodeJS.Timeout
}

const keyOf = (kind: ProgramKind): string => `${kind.version}\n${kind.lock}\n${kind.gpu}`

/**
 * Takes how many Python programs are kept warm for one kind, how long an idle one stands before it is ended, in
 * milliseconds, what starts a program of a kind, and the files whose program is not ended for standing idle.
 * Answers the pool of one app.
 */
export function pythonPool(o: {
  count: number
  stopAfter: number
  start(kind: ProgramKind): Promise<PythonProgram>
  keep?(file: string): boolean
}): Pool {
  const held: Held[] = []
  const starting = new Map<string, number>()
  const waiting: (() => void)[] = []
  let closed = false
  let running: string | undefined
  const wake = (): void => {
    for (const one of waiting.splice(0)) one()
  }
  const gone = (one: Held): void => {
    const at = held.indexOf(one)
    if (at >= 0) held.splice(at, 1)
    clearTimeout(one.idle)
    wake()
  }
  const idleAfter = (one: Held): void => {
    clearTimeout(one.idle)
    if (one.files.length || [...one.program.loaded].some((file) => o.keep?.(file))) return
    one.idle = setTimeout(() => {
      if (one.files.length) return
      gone(one)
      one.program.end()
    }, o.stopAfter)
    one.idle.unref()
  }
  const free = (one: Held, file: string, atOnce: number): boolean =>
    !one.files.length || (one.files.every((other) => other === file) && one.files.length < atOnce)
  const taken = (one: Held, file: string, claimed = false): Place => {
    clearTimeout(one.idle)
    if (!claimed) one.files.push(file)
    one.program.usedAt = performance.now()
    let given = false
    return {
      program: one.program,
      release: () => {
        if (given) return
        given = true
        const at = one.files.indexOf(file)
        if (at >= 0) one.files.splice(at, 1)
        one.program.usedAt = performance.now()
        const old = running !== undefined && one.kind.version !== running
        if ((one.beyond || old) && !one.files.length) {
          gone(one)
          one.program.end()
        } else idleAfter(one)
        wake()
      },
    }
  }
  const started = async (kind: ProgramKind, beyond: boolean, file: string): Promise<Held> => {
    const key = keyOf(kind)
    starting.set(key, (starting.get(key) ?? 0) + 1)
    try {
      const program = await o.start(kind)
      // A program that came up after the pool was closed is ended at once.
      if (closed) {
        program.end()
        throw new TentError('T0013', 'The app was closed while a Python program of it was started.')
      }
      // The new program is the call's before any other that waits is woken: its place is claimed as it stands.
      const one: Held = { kind, key, program, files: [file], beyond }
      held.push(one)
      void program.ended.then(() => gone(one))
      return one
    } finally {
      starting.set(key, (starting.get(key) ?? 1) - 1)
      wake()
    }
  }
  // A program of an older version that stands idle is ended once a call of another version asks: new code is
  // never carried out by a program of the old, and the old ones are not kept warm.
  const retire = (kind: ProgramKind): void => {
    for (const one of [...held])
      if (one.kind.version !== kind.version && !one.files.length) {
        gone(one)
        one.program.end()
      }
  }
  return {
    async place(asked) {
      const key = keyOf(asked.kind)
      retire(asked.kind)
      for (;;) {
        if (closed)
          throw new TentError('T0013', 'The app was closed while a call of a `python` waited for its program.')
        // A call whose time ran out meanwhile was answered T0008 already: it takes no place, free or not.
        const left = asked.until - performance.now()
        if (left <= 0)
          throw new TentError('T0008', `${asked.name} waited past its time for a free place in a Python program.`, {
            fix: 'Raise `limits.pythonPrograms` of the project, or `atOnce` of the definition.',
          })
        const found = held.find((one) => one.key === key && free(one, asked.file, asked.atOnce))
        if (found) return taken(found, asked.file)
        const warm = held.filter((one) => one.key === key && !one.beyond).length + (starting.get(key) ?? 0)
        if (warm < o.count || asked.inside) {
          const start = (): Promise<Held> => started(asked.kind, warm >= o.count, asked.file)
          return taken(await (asked.starting ? asked.starting(start) : start()), asked.file, true)
        }
        await new Promise<void>((done) => {
          // A wait with no end is woken by a place that is freed alone: a timer holds no more than a 32-bit number.
          const timer = setTimeout(done, Math.min(left, 2_000_000_000))
          timer.unref()
          waiting.push(() => {
            clearTimeout(timer)
            done()
          })
        })
      }
    },
    switched(version) {
      running = version
      for (const one of [...held])
        if (one.kind.version !== version && !one.files.length) {
          gone(one)
          one.program.end()
        }
    },
    loaded: (version) =>
      new Set(held.filter((one) => one.kind.version === version).flatMap((one) => [...one.program.loaded])),
    close() {
      closed = true
      for (const one of held.splice(0)) {
        clearTimeout(one.idle)
        one.program.end()
      }
      wake()
    },
  }
}
