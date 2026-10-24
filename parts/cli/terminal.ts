import type { Interface } from 'node:readline'
import { createInterface, emitKeypressEvents } from 'node:readline'
import { safe } from '../connect/index.ts'
import type { Terminal } from '../core/index.ts'
import { typedHidden } from './hidden.ts'

/** A key as a command is handed it. */
interface Key {
  name: string
  text: string
  ctrl: boolean
  alt: boolean
  shift: boolean
}

/** What the reader of the runtime tells of a key that was pressed. */
interface Pressed {
  name?: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
}

/**
 * The keys of the input, one by one, while they are read: at a terminal it is put in the mode that hands each key
 * as it is typed, and back when the reading ends. The key that ends a program ends the reading and stops the
 * command, as at any other time.
 */
async function* keysOf(): AsyncGenerator<Key> {
  const input = process.stdin
  emitKeypressEvents(input)
  const raw = input.isTTY === true
  if (raw) input.setRawMode(true)
  const waiting: (Key | undefined)[] = []
  let wake: (() => void) | undefined
  const told = (): void => {
    wake?.()
    wake = undefined
  }
  const pressed = (text: string | undefined, key: Pressed | undefined): void => {
    waiting.push({
      name: key?.name ?? text ?? '',
      text: text ?? '',
      ctrl: key?.ctrl === true,
      alt: key?.meta === true,
      shift: key?.shift === true,
    })
    told()
  }
  const ended = (): void => {
    waiting.push(undefined)
    told()
  }
  input.on('keypress', pressed)
  input.once('end', ended)
  input.resume()
  try {
    for (;;) {
      if (!waiting.length)
        await new Promise<void>((done) => {
          wake = done
        })
      const key = waiting.shift()
      if (key === undefined) return
      // In the mode that hands each key, the system sends the program no signal for this key: it is sent here.
      if (key.ctrl && key.name === 'c') {
        process.emit('SIGINT', 'SIGINT')
        return
      }
      yield key
    }
  } finally {
    input.off('keypress', pressed)
    input.off('end', ended)
    if (raw) input.setRawMode(false)
    input.pause()
  }
}

/**
 * The terminal of this program: the output, the error output and the input, and what closes it. A person sits at
 * it where the input and the error output are both a terminal. The input is read only once a line or a key is
 * asked for, so a command that asks for none leaves it alone. A hidden line at a terminal shows none of what is typed.
 */
export function processTerminal(): { terminal: Terminal; close(): void } {
  let lines: Interface | undefined
  const waiting: string[] = []
  const takers: ((line: string | undefined) => void)[] = []
  let ended = false
  // While a hidden line is typed, the reader of lines sees the same keys: what it makes of them is no line.
  let hiding = false
  const opened = (): Interface => {
    if (lines) return lines
    const made = createInterface({ input: process.stdin, terminal: false })
    made.on('line', (line) => {
      if (hiding) return
      const taker = takers.shift()
      if (taker) taker(line)
      else waiting.push(line)
    })
    made.on('close', () => {
      ended = true
      for (const taker of takers.splice(0)) taker(undefined)
    })
    lines = made
    return made
  }
  const interactive = process.stdin.isTTY === true && process.stderr.isTTY === true
  const terminal: Terminal = {
    write: (text) => void process.stdout.write(safe(text)),
    error: (text) => void process.stderr.write(safe(text)),
    raw: (text) => void process.stdout.write(text),
    line: async (o) => {
      if (o?.hidden === true && interactive) {
        hiding = true
        try {
          return await typedHidden()
        } finally {
          hiding = false
        }
      }
      opened()
      const held = waiting.shift()
      if (held !== undefined || ended) return held
      return new Promise((done) => takers.push(done))
    },
    keys: keysOf,
    size: () => ({ columns: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24 }),
    onResize: (fn) => {
      process.stdout.on('resize', fn)
      return () => void process.stdout.off('resize', fn)
    },
    interactive,
    color: process.stdout.isTTY === true,
  }
  return { terminal, close: () => lines?.close() }
}
