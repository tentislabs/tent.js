// Lines a thread hands its program as it takes them, through memory the two share: a write of memory waits on no turn
// of the thread's loop, so a thread held on a lock, or ended where it stands, has handed every line it took. The first
// four bytes of the memory count the bytes of the lines that follow.
import type { Worker, WorkerOptions } from 'node:worker_threads'

// Room for the lines of one thread: a thread that fills it tells the rest in a way of its own.
const size = 4 * 1024 * 1024

const keyOf = (name: string): string => `tent.thread.lines.${name}`

/**
 * Takes the name of what hands lines, the code that a thread is to run as a script, and the options it is started
 * with. Answers the memory of the thread, with the code and the options that hand it to the thread: its code then
 * finds the data it was handed as it was handed, and `handLine` the memory under that name.
 */
export function linesHanded(
  name: string,
  code: string,
  options: WorkerOptions,
): { memory: SharedArrayBuffer; code: string; options: WorkerOptions } {
  const memory = new SharedArrayBuffer(size)
  // A block of its own, so that two names handed to one thread each take theirs.
  const taken = [
    "const threads = require('node:worker_threads')",
    'const given = threads.workerData',
    'threads.workerData = given.data',
    "require('node:module').syncBuiltinESMExports()",
    `globalThis[Symbol.for(${JSON.stringify(keyOf(name))})] = given.lines`,
  ].join('\n')
  return {
    memory,
    code: `{\n${taken}\n}\n${code}`,
    options: { ...options, eval: true, workerData: { data: options.workerData, lines: memory } },
  }
}

/**
 * In a thread, takes a name and a line. Writes the line into the memory its program handed it under that name.
 * Answers false where it was handed none, or where the line does not fit.
 */
export function handLine(name: string, line: string): boolean {
  const memory: unknown = Reflect.get(globalThis, Symbol.for(keyOf(name)))
  if (!(memory instanceof SharedArrayBuffer)) return false
  const length = new Int32Array(memory, 0, 1)
  const bytes = Buffer.from(line)
  const at = 4 + Atomics.load(length, 0)
  if (at + bytes.length > memory.byteLength) return false
  new Uint8Array(memory).set(bytes, at)
  Atomics.add(length, 0, bytes.length)
  return true
}

// What tells the lines of each thread that lives, which runs as the thread ends, or as this program ends first.
const living = new Set<() => void>()
process.once('exit', () => {
  for (const end of [...living]) end()
})

/**
 * Takes a thread that was started with its memory, and what tells its lines. Tells them once, where there are any:
 * as the thread ends, by itself or ended, or as this program ends first.
 */
export function toldAsItEnds(thread: Worker, memory: SharedArrayBuffer, tell: (lines: string) => void): void {
  const end = (): void => {
    if (!living.delete(end)) return
    const length = Atomics.load(new Int32Array(memory, 0, 1), 0)
    if (length > 0) tell(Buffer.from(memory, 4, length).toString())
  }
  living.add(end)
  thread.once('exit', end)
}
