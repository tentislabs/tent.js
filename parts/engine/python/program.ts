import { createInterface } from 'node:readline'
import { TentError } from '../../core/index.ts'
import { fileURLToPath } from 'node:url'
import type { AppProgram, ProgramStart } from '../rooms/room.ts'
import { channelFrameOf, frameReader } from './frames.ts'
import { namedEnvironment } from '../namedEnvironment.ts'
import { childUsed } from '../counts/program.ts'

// What leads a line that a print of Python wrote, on the error stream: `PRINTED` of our side.
const printed = '\x1f'

/** Our side of the Python program, which ships with the engine. */
const side = fileURLToPath(new URL('./side.py', import.meta.url))

// The variables by which the libraries of graphics cards are told which cards they see: none, unless a definition
// states `gpu: true`.
const cards = ['CUDA_VISIBLE_DEVICES', 'HIP_VISIBLE_DEVICES', 'ROCR_VISIBLE_DEVICES', 'ONEAPI_DEVICE_SELECTOR']

/** What a Python program is started with. */
export interface Starting {
  // The Python of the environment of its lock.
  python: string
  // The folders of the bundle that are put on its path: `python/`, and each root under it.
  paths: string[]
  gpu: boolean
  frameSize: number
  // Told each line that the program wrote to its standard output or its error, with the call at work then.
  line(text: string, error: boolean, call: string | undefined): void
  // Starts the program in the room of the app.
  start(o: ProgramStart): AppProgram
}

/** What the Python program sent about a call, or asked for one. */
export type PythonTold = Record<string, unknown> & { t: string }

/** One Python program: a program of its own, which the engine speaks to over its channel. */
export interface PythonProgram {
  // The files of definitions it holds loaded.
  loaded: Set<string>
  // The calls it holds now, and the one that began last: a line that comes after its call has ended is of it.
  calls: Set<string>
  lastCall?: string
  // The last moment a call began or ended in it, by the clock of the runtime.
  usedAt: number
  // What it reported last: its processor time outside every call, in milliseconds, the memory it holds, and the
  // processor time of each call in it so far.
  reading: { cpuMs: number; memory: number; calls: Record<string, number> }
  // Sends one frame. Throws T7119 for one past `limits.pythonFrameSize`, and sends nothing then.
  send(value: object): void
  // Is told each frame that names a call or a load, by that name.
  on(id: string, told: (value: PythonTold) => void): void
  off(id: string): void
  // Ends the program, with every program it started.
  end(): void
  // Answers once the program has ended, with why where the engine knows it.
  ended: Promise<string>
}

/**
 * Starts a Python program in the room of the app: the Python of an environment with our side, isolated from every
 * setting and package of a Python of the person's own, with the channel as its standard input and output, its
 * error stream and its prints read as lines of the log. Its environment is the named list, with the graphics cards
 * hidden unless `gpu` is stated. Answers the program once it said that it is ready, or the reason it did not.
 */
export function startProgram(o: Starting): Promise<PythonProgram> {
  const env = namedEnvironment()
  if (!o.gpu) for (const name of cards) env[name] = ''
  else for (const name of cards) if (process.env[name] !== undefined) env[name] = String(process.env[name])
  let child: AppProgram
  try {
    child = o.start({
      for: 'python',
      command: o.python,
      args: ['-I', '-u', '-X', 'utf8', side, String(o.frameSize), ...o.paths],
      folder: o.paths[0] ?? '',
      env,
    })
  } catch (error) {
    return Promise.reject(error)
  }
  const listeners = new Map<string, (value: PythonTold) => void>()
  const calls = new Set<string>()
  let why = ''
  let started = false
  let gone: { why: string } | undefined
  // Ended at its exit, not when its streams close: a program it started may hold its output open long after.
  const ended = child.ended.then(
    () => {
      child.end()
      childUsed(0, 0, program)
      return why
    },
    (error: unknown) => {
      why = `start:${error instanceof Error ? error.message : String(error)}`
      return why
    },
  )
  const program: PythonProgram = {
    loaded: new Set(),
    calls,
    usedAt: performance.now(),
    reading: { cpuMs: 0, memory: 0, calls: {} },
    send(value) {
      const frame = channelFrameOf(value)
      // Our side leaves its loop at a frame past its size, which would end the program with nothing said.
      if (frame.length - 4 > o.frameSize)
        throw new TentError(
          'T7119',
          `A frame of ${frame.length - 4} bytes for the Python program is past \`limits.pythonFrameSize\` of ${o.frameSize}.`,
          { fix: 'Hand large data to Python as a file: a `file` in the input, or `rows`.' },
        )
      if (child.stdin.writable) child.stdin.write(frame)
    },
    on(id, told) {
      // A call that comes to listen after the program ended is told so at once: it waits for nothing that comes.
      if (gone) {
        const why = gone.why
        queueMicrotask(() => told({ t: 'ended', why }))
        return
      }
      listeners.set(id, told)
    },
    off: (id) => void listeners.delete(id),
    end: () => child.end(),
    ended,
  }
  // A program that ends before it has read what it was sent closes its input: that is no failure of the engine.
  child.stdin.on('error', () => undefined)
  const atWork = (): string | undefined => [...calls][0] ?? program.lastCall
  // A print of Python comes on the error stream too, its line led by a mark: it is the program's output, no error.
  createInterface({ input: child.stderr }).on('line', (text) =>
    text.startsWith(printed) ? o.line(text.slice(printed.length), false, atWork()) : o.line(text, true, atWork()),
  )
  return new Promise((ready, failed) => {
    const told = (value: unknown): void => {
      const frame: PythonTold = { ...Object(value), t: String(Reflect.get(Object(value), 't')) }
      if (frame.t === 'ready') {
        started = true
        ready(program)
        return
      }
      if (frame.t === 'reading') {
        const cpuMs = Number(frame.cpuMs) || 0
        // What it used outside every call, the loading among it, is no call's: it is the program's own.
        childUsed(cpuMs - program.reading.cpuMs, Number(frame.memory) || 0, program)
        const calls: Record<string, number> = {}
        for (const [call, spent] of Object.entries(Object(frame.calls))) calls[call] = Number(spent) || 0
        program.reading = { cpuMs, memory: Number(frame.memory) || 0, calls }
        return
      }
      if (frame.t === 'memory') why = `memory:${Number(frame.limit)}`
      const id = frame.call ?? frame.load
      const listener = typeof id === 'string' ? listeners.get(id) : undefined
      if (listener) listener(frame)
      else if (frame.t === 'memory') for (const one of [...listeners.values()]) one(frame)
    }
    const refused = (said: string): void => {
      why = `frame:${said}`
      child.end()
    }
    const reader = frameReader(o.frameSize, told, refused)
    child.stdout.on('data', (piece: Buffer) => reader(piece))
    void ended.then(() => {
      gone = { why }
      if (!started) failed(new Error(why || 'The Python program ended before it was ready.'))
      for (const one of [...listeners.values()]) one({ t: 'ended', why })
    })
  })
}
