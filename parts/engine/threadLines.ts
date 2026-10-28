// Lines the threads of a program hand it as they take them, through one memory of the program that it hands to each
// thread it starts, and each thread to each it starts, however deep. A write of memory waits on no turn of a thread's
// loop, and the program reads the memory itself as it ends: no thread held on a lock, ended where it stands, or ended
// with the thread that started it takes a line with it.
import type { WorkerOptions } from 'node:worker_threads'

// The memory holds two counts, of the bytes of the rooms taken and of the lines listed; then the list, each line
// written by where its room starts and its size; then the rooms. A thread whose line does not fit, in the rooms or in
// the list, tells it in a way of its own.
const size = 16 * 1024 * 1024
const listed = 512 * 1024
const rooms = 8 + listed * 8

const keyOf = (name: string): string => `tent.thread.lines.${name}`

// The memory of each name that this program made for its threads.
const made = new Map<string, SharedArrayBuffer>()

/** The memory of a name that this thread was handed, or nothing in a program's own thread. */
function handedOf(name: string): SharedArrayBuffer | undefined {
  const memory: unknown = Reflect.get(globalThis, Symbol.for(keyOf(name)))
  return memory instanceof SharedArrayBuffer ? memory : undefined
}

/**
 * Takes the name of what hands lines, the code that a thread is to run as a script, and the options it is started
 * with. Answers the code and the options that hand the thread the memory of that name: the memory this thread was
 * handed, or else the program's own. The thread's code finds the data it was handed as it was handed.
 */
export function linesHanded(
  name: string,
  code: string,
  options: WorkerOptions,
): { code: string; options: WorkerOptions } {
  let memory = handedOf(name) ?? made.get(name)
  if (!memory) {
    memory = new SharedArrayBuffer(size)
    made.set(name, memory)
  }
  // A block of its own, so that two names handed to one thread each take theirs.
  const taken = [
    "const threads = require('node:worker_threads')",
    'const given = threads.workerData',
    'threads.workerData = given.data',
    "require('node:module').syncBuiltinESMExports()",
    `globalThis[Symbol.for(${JSON.stringify(keyOf(name))})] = given.lines`,
  ].join('\n')
  return {
    code: `{\n${taken}\n}\n${code}`,
    options: { ...options, eval: true, workerData: { data: options.workerData, lines: memory } },
  }
}

/**
 * In a thread, takes a name and a line. Writes the line into the memory of the program that it was handed under that
 * name. Answers false where it was handed none, or where the line does not fit.
 */
export function handLine(name: string, line: string): boolean {
  const memory = handedOf(name)
  if (!memory) return false
  const counts = new Int32Array(memory, 0, 2)
  const bytes = Buffer.from(line)
  if (rooms + Atomics.load(counts, 0) + bytes.length > size || Atomics.load(counts, 1) >= listed) return false
  // The room of the line is taken first, so two threads that write at once each write a room of its own.
  const at = Atomics.add(counts, 0, bytes.length)
  if (rooms + at + bytes.length > size) return false
  new Uint8Array(memory).set(bytes, rooms + at)
  // The line is listed once it is written, its size last: a room that a thread ended before it listed is never read.
  const entry = Atomics.add(counts, 1, 1)
  if (entry >= listed) return false
  const list = new Int32Array(memory, 8, listed * 2)
  Atomics.store(list, entry * 2, at)
  Atomics.store(list, entry * 2 + 1, bytes.length)
  return true
}

/**
 * In a program, takes a name and what tells lines. Tells, as the program ends, every line that its threads of any
 * depth handed it under that name, where there are any.
 */
export function linesTold(name: string, tell: (lines: string) => void): void {
  process.once('exit', () => {
    const memory = made.get(name)
    if (!memory) return
    // Each line is read by the room and the size it was listed with, never by what a room holds, in the order taken.
    const list = new Int32Array(memory, 8, listed * 2)
    const written: [number, number][] = []
    for (let entry = 0; entry < Math.min(Atomics.load(new Int32Array(memory, 0, 2), 1), listed); entry++) {
      const length = Atomics.load(list, entry * 2 + 1)
      if (length > 0) written.push([Atomics.load(list, entry * 2), length])
    }
    written.sort(([one], [other]) => one - other)
    const lines = written.map(([at, length]) => Buffer.from(memory, rooms + at, length).toString()).join('')
    if (lines !== '') tell(lines)
  })
}
