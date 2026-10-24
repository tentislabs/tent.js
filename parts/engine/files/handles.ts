import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// The bound as it was read: it is read once for the program.
let read: { bound: number | undefined } | undefined

/** Reads a bound as a system writes it: a whole number, and nothing for `unlimited`. */
const boundIn = (text: string | undefined): number | undefined => {
  const bound = Number(text)
  return Number.isInteger(bound) && bound > 0 ? bound : undefined
}

/**
 * Answers how many file handles the system gives this program at the most, or nothing where it states no bound,
 * as Windows does for the files of a data store. Linux says it in a file of the program, and the other systems by
 * their shell.
 */
export function handleBound(): number | undefined {
  if (read) return read.bound
  let bound: number | undefined
  try {
    if (process.platform === 'linux')
      bound = boundIn(/^Max open files\s+(\S+)/m.exec(readFileSync('/proc/self/limits', 'utf8'))?.[1])
    else if (process.platform !== 'win32')
      bound = boundIn(execFileSync('/bin/sh', ['-c', 'ulimit -n'], { encoding: 'utf8', timeout: 2000 }).trim())
  } catch {
    // A system that does not say its bound is held to none.
  }
  read = { bound }
  return bound
}

/**
 * Takes the bound of file handles of this program, where whoever started the engine knows it, or nothing for a
 * system that states none: the system is asked no more. `'ask'` has the system asked again at the next need.
 */
export function boundGiven(bound: number | undefined | 'ask'): void {
  read = bound === 'ask' ? undefined : { bound }
}

/**
 * Whether an error says that the system refused this program a file handle: the system's own code for it, or
 * SQLite's for a file that it could not open, also where the store wrapped the error it was handed.
 */
export function refusedHandle(error: unknown): boolean {
  let at: unknown = error
  for (let depth = 0; depth < 4 && typeof at === 'object' && at !== null; depth++) {
    const [code, errcode]: unknown[] = [Reflect.get(at, 'code'), Reflect.get(at, 'errcode')]
    if (code === 'EMFILE' || code === 'ENFILE') return true
    // 14: SQLite could not open the file. https://sqlite.org/rescode.html#cantopen
    if (typeof errcode === 'number' && (errcode & 255) === 14) return true
    at = Reflect.get(at, 'cause')
  }
  return false
}
