// The crossing of values between the engine and a room whose code lives in a heap of its own: the runtime's
// structured clone, with a mark in place of what it cannot carry. Both sides use it, so it imports `core` alone, and
// the crossing of errors beside it, which imports `core` alone too.
import { TentError } from '../../core/index.ts'
import type { Crossed } from './crossing.ts'
import { crossed, revived, rowsAsText, rowsOfText } from './crossing.ts'

// The key of a mark: no value that code makes holds it.
const key = '\u0000tent'

/** What stands for a value that structured clone cannot carry. */
type Marked =
  | { [key]: 'fn'; n: number; members?: Record<string, unknown> }
  | { [key]: 'promise'; n: number }
  | { [key]: 'stream'; n: number }
  | { [key]: 'iterable'; n: number }
  | { [key]: 'named'; n: number }
  | { [key]: 'headers'; entries: [string, string][] }
  | { [key]: 'theirs'; n: number }
  | { [key]: 'rows'; text: string; moments: string[]; list?: unknown; row?: unknown }
  | { [key]: 'db'; n: number; tables: string[]; mode: 'read' | 'write' | 'async'; full: boolean; refused?: string }
  | { [key]: 'error'; failed: Crossed }
  | { [key]: 'tagged'; tag: unknown; value: unknown }
  | {
      [key]: 'response'
      status: number
      statusText: string
      headers: [string, string][]
      body?: Marked
    }
  | {
      [key]: 'request'
      url: string
      method: string
      headers: [string, string][]
      body?: Marked
      // The request itself, kept by the side that handed it, which answers it when it crosses back.
      own: number
    }

/** What a side keeps of what it hands the other, so the other can ask for it by its number. */
export interface Keeper {
  fn(fn: (...args: unknown[]) => unknown): number
  promise(promise: PromiseLike<unknown>): number
  stream(stream: ReadableStream<Uint8Array>): number
  // The mark of a `db` the side hands, where a value is one.
  db(value: object): Omit<Extract<Marked, { [key]: 'db' }>, typeof key> | undefined
  // What a value is kept as, which crosses with its copy: a row that a `db` handed out.
  tag?(value: object): unknown
}

/** How a side asks for what the other kept: a function called, a promise awaited, the next piece of a stream, a `db`. */
export interface Asker {
  fn(n: number, args: unknown[]): unknown
  promise(n: number): Promise<unknown>
  pull(n: number): Promise<Uint8Array | undefined>
  db(mark: Extract<Marked, { [key]: 'db' }>): object
  // Keeps a copy as what it was kept as on the other side.
  tagged?(value: object, tag: unknown): object
  // Keeps the call open while a stream of the other side is read here: answers what lets it go.
  held?(): () => void
  // What this side handed the other in the call, by its number, as the other hands it back.
  theirs?(n: number): unknown
}

// The records that are read by name, as the secrets a maker is handed: one that answers any name has no members to copy.
const byName = new WeakSet<object>()

/** Takes a record that answers its members by name alone. Answers it, marked to cross as one read by name. */
export function readByName<Record extends object>(record: Record): Record {
  byName.add(record)
  return record
}

// Each request that came from the other side, by the number under which that side keeps it.
const came = new WeakMap<Request, number>()

// What each copy that crossed was kept as on the side it came from, on a side that keeps no mark of its own.
const tags = new WeakMap<object, unknown>()

/** How deep, and how large, a value that crosses may be. */
export interface Bounds {
  depth: number
  // The most entries or characters, as `limits.valueSize` counts them.
  size: number
}

const isMarked = (value: unknown): value is Marked =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, key) === 'string'

const tooLarge = (what: string): TentError =>
  new TentError('T0009', `A value that crosses into or out of the room of the app is ${what}.`, {
    fix: 'Hand and answer smaller values: a value crosses 64 deep and `limits.valueSize` large at most.',
  })

// What structured clone carries as it is: copied whole, with nothing inside it to mark.
const whole = (value: object): boolean =>
  value instanceof Date || value instanceof RegExp || value instanceof ArrayBuffer || ArrayBuffer.isView(value)

/**
 * Takes a value of this side, what keeps what cannot cross, and the bounds. Answers the value as it crosses: a
 * record of its own fields for a value of a class, each getter read once, and a mark for a function, a promise, a
 * stream, a `db`, an error, a request and a response. Throws T0009 for a value deeper or larger than the bounds.
 */
export function outOf(value: unknown, keep: Keeper, bounds: Bounds): unknown {
  let size = 0
  const seen = new Map<object, unknown>()
  const count = (n: number): void => {
    size += n
    if (size > bounds.size) throw tooLarge(`larger than ${bounds.size}`)
  }
  const walk = (one: unknown, depth: number): unknown => {
    if (depth > bounds.depth) throw tooLarge(`deeper than ${bounds.depth}`)
    if (typeof one === 'string') {
      count(one.length)
      return one
    }
    if (typeof one === 'function') {
      const n = keep.fn((...args) => Reflect.apply(one, undefined, args))
      // A function that holds members of its own, as `step` holds `step.all`, crosses with them.
      const names = Object.keys(one)
      if (!names.length) return { [key]: 'fn', n }
      const members: Record<string, unknown> = {}
      for (const name of names) members[name] = walk(Reflect.get(one, name), depth + 1)
      return { [key]: 'fn', n, members }
    }
    if (typeof one !== 'object' || one === null) return one
    const held = seen.get(one)
    if (held !== undefined) return held
    if (whole(one)) return one
    if (one instanceof Error) return { [key]: 'error', failed: crossed(one) }
    // Read by name, it is asked nothing else, not even whether it is a promise.
    if (byName.has(one)) return { [key]: 'named', n: keep.fn((name) => Reflect.get(one, String(name))) }
    if (typeof Reflect.get(one, 'then') === 'function') return { [key]: 'promise', n: keep.promise(Object(one)) }
    if (typeof ReadableStream === 'function' && one instanceof ReadableStream)
      return { [key]: 'stream', n: keep.stream(one) }
    const theirs = typeof Request === 'function' && one instanceof Request ? came.get(one) : undefined
    if (theirs !== undefined) return { [key]: 'theirs', n: theirs }
    if (typeof Response === 'function' && (one instanceof Response || one instanceof Request)) return message(one)
    if (typeof Headers === 'function' && one instanceof Headers) return { [key]: 'headers', entries: [...one] }
    if (typeof Reflect.get(one, Symbol.asyncIterator) === 'function') return iterable(one)
    const db = keep.db(one)
    if (db) return { [key]: 'db', ...db }
    const tag = keep.tag?.(one) ?? tags.get(one)
    if (tag === undefined) return plain(one, depth)
    const made: { [key]: 'tagged'; tag: unknown; value: unknown } = { [key]: 'tagged', tag, value: {} }
    seen.set(one, made)
    made.value = plain(one, depth)
    return made
  }
  const plain = (one: object, depth: number): unknown => {
    if (Array.isArray(one)) {
      count(one.length)
      const made: unknown[] = []
      seen.set(one, made)
      for (const entry of one) made.push(walk(entry, depth + 1))
      return made
    }
    if (one instanceof Map) {
      const made = new Map<unknown, unknown>()
      seen.set(one, made)
      for (const [name, entry] of one) made.set(walk(name, depth + 1), walk(entry, depth + 1))
      return made
    }
    if (one instanceof Set) {
      const made = new Set<unknown>()
      seen.set(one, made)
      for (const entry of one) made.add(walk(entry, depth + 1))
      return made
    }
    const made: Record<string, unknown> = {}
    seen.set(one, made)
    // A record that stands on another, as what a `db` gives, crosses with the members it takes from it.
    for (const name in one) made[name] = walk(Reflect.get(one, name), depth + 1)
    return made
  }
  const message = (one: Response | Request): Marked => {
    const headers = [...one.headers]
    // A body that was read already crosses as none: what read it holds its bytes. A request crosses its body from a
    // copy, so that the request itself stays whole for the side that keeps it and is handed it back.
    const read = one.body && !one.bodyUsed ? (one instanceof Request ? one.clone().body : one.body) : null
    const body = read ? { body: { [key]: 'stream' as const, n: keep.stream(read) } } : {}
    return one instanceof Response
      ? { [key]: 'response', status: one.status, statusText: one.statusText, headers, ...body }
      : { [key]: 'request', url: one.url, method: one.method, headers, ...body, own: keep.fn(() => one) }
  }
  // An async iterable, as what a `Provider` answers: its next piece is pulled by a callable, and it is let go early.
  const iterable = (one: object): Marked => {
    const made: unknown = Reflect.apply(Reflect.get(one, Symbol.asyncIterator), one, [])
    const step = (how: unknown): unknown => {
      const member: unknown = Reflect.get(Object(made), how === 'return' ? 'return' : 'next')
      return typeof member === 'function' ? Reflect.apply(member, made, []) : { done: true, value: undefined }
    }
    return { [key]: 'iterable', n: keep.fn(step) }
  }
  return walk(value, 0)
}

/**
 * Takes what a read answered, the columns of its table, and what keeps what cannot cross. Answers its rows as they
 * cross as JSON text, with what the list and each row were kept as, where the crossing chooses that form for them;
 * and the answer as it is otherwise, to cross by the structured clone.
 */
export function rowsOut(answer: unknown, columns: Record<string, unknown> | undefined, keep: Keeper): unknown {
  if (!Array.isArray(answer)) return answer
  const row = answer.length ? keep.tag?.(Object(answer[0])) : undefined
  // The rows of one read are kept as one thing: where one is kept as another, they cross as values.
  if (!answer.every((one) => keep.tag?.(Object(one)) === row)) return answer
  const written = rowsAsText(answer, columns)
  if (written === undefined) return answer
  const list = keep.tag?.(answer)
  return {
    [key]: 'rows',
    ...written,
    ...(list === undefined ? {} : { list }),
    ...(row === undefined ? {} : { row }),
  }
}

/** A list of values as it crosses, as `outOf` makes each of them cross. */
export function outList(values: unknown[], keep: Keeper, bounds: Bounds): unknown[] {
  const made = outOf(values, keep, bounds)
  return Array.isArray(made) ? made : []
}

/** The stream that a marked stream stands for: each piece is pulled from the side that holds it. */
function streamOf(n: number, ask: Asker): ReadableStream<Uint8Array> {
  // The stream may be read after its call answered, as the body of a response is: the call stays open until it ends.
  const release = ask.held?.()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const piece = await ask.pull(n)
        if (piece !== undefined) return controller.enqueue(piece)
        release?.()
        controller.close()
      } catch (error) {
        release?.()
        throw error
      }
    },
    cancel: () => release?.(),
  })
}

/** The async iterable that a marked one stands for: each piece is pulled from the side that holds it. */
function iterableOf(n: number, ask: Asker): AsyncIterable<unknown> {
  // It may be read after its call answered, as a reply is: the call stays open until it ends.
  const release = ask.held?.()
  const pulled = async (how: 'next' | 'return'): Promise<IteratorResult<unknown>> => {
    try {
      const got: unknown = await ask.fn(n, [how])
      const done = Reflect.get(Object(got), 'done') === true
      if (done || how === 'return') release?.()
      return done
        ? { done: true, value: Reflect.get(Object(got), 'value') }
        : { done: false, value: Reflect.get(Object(got), 'value') }
    } catch (error) {
      release?.()
      throw error
    }
  }
  return { [Symbol.asyncIterator]: () => ({ next: () => pulled('next'), return: () => pulled('return') }) }
}

/**
 * Takes a value that crossed and how this side asks for what the other kept. Answers it as a value of this heap: a
 * function that asks for its call, a promise that the other side settles, a stream pulled piece by piece, a `db`,
 * and an error rebuilt as an error of this heap, a `TentError` with what it carried.
 */
export function intoOf(value: unknown, ask: Asker): unknown {
  return intoAt(value, ask)
}

/** What crossed, taken into this heap at once, or once the way that answers it later has answered. */
export function intoLater(value: unknown, ask: Asker): unknown {
  return value instanceof Promise ? value.then((one: unknown) => intoAt(one, ask)) : intoAt(value, ask)
}

function intoAt(value: unknown, ask: Asker): unknown {
  const seen = new Map<object, unknown>()
  const walk = (one: unknown): unknown => {
    if (typeof one !== 'object' || one === null || whole(one)) return one
    const held = seen.get(one)
    if (held !== undefined) return held
    if (isMarked(one)) return marked(one)
    if (Array.isArray(one)) {
      const made: unknown[] = []
      seen.set(one, made)
      for (const entry of one) made.push(walk(entry))
      return made
    }
    if (one instanceof Map) {
      const made = new Map<unknown, unknown>()
      seen.set(one, made)
      for (const [name, entry] of one) made.set(walk(name), walk(entry))
      return made
    }
    if (one instanceof Set) {
      const made = new Set<unknown>()
      seen.set(one, made)
      for (const entry of one) made.add(walk(entry))
      return made
    }
    const made: Record<string, unknown> = {}
    seen.set(one, made)
    for (const name of Object.keys(one)) made[name] = walk(Reflect.get(one, name))
    return made
  }
  // A copy kept as what it was kept as on the other side.
  const keptAgain = (value: object, tag: unknown): object => {
    if (ask.tagged) return ask.tagged(value, tag)
    tags.set(value, tag)
    return Object.freeze(value)
  }
  const marked = (one: Marked): unknown => {
    switch (one[key]) {
      case 'fn': {
        const { n } = one
        const made = (...args: unknown[]) => ask.fn(n, args)
        for (const [name, member] of Object.entries(one.members ?? {})) Reflect.set(made, name, walk(member))
        return made
      }
      case 'promise':
        return ask.promise(one.n)
      case 'stream':
        return streamOf(one.n, ask)
      case 'iterable':
        return iterableOf(one.n, ask)
      case 'named': {
        const { n } = one
        return new Proxy(
          {},
          { get: (_, name) => (typeof name === 'string' && name !== 'then' ? ask.fn(n, [name]) : undefined) },
        )
      }
      case 'headers':
        return new Headers(one.entries)
      case 'theirs': {
        const own = ask.theirs?.(one.n)
        if (own === undefined)
          throw new TentError('T0013', 'A request crossed back that this side did not hand in the call.')
        return own
      }
      case 'db':
        return ask.db(one)
      case 'error':
        return revived(one.failed)
      case 'tagged': {
        const value: unknown = walk(one.value)
        if (typeof value !== 'object' || value === null) return value
        return keptAgain(value, one.tag)
      }
      case 'rows': {
        const rows: unknown = rowsOfText(one.text, one.moments)
        if (!Array.isArray(rows)) return rows
        const made = one.row === undefined ? rows : rows.map((row: unknown) => keptAgain(Object(row), one.row))
        return one.list === undefined ? made : keptAgain(made, one.list)
      }
      case 'response':
        return new Response(one.body && one.body[key] === 'stream' ? streamOf(one.body.n, ask) : null, {
          status: one.status,
          statusText: one.statusText,
          headers: one.headers,
        })
      case 'request': {
        const body = one.body && one.body[key] === 'stream' ? streamOf(one.body.n, ask) : undefined
        const request = new Request(one.url, {
          method: one.method,
          headers: one.headers,
          ...(body ? { body, duplex: 'half' } : {}),
        })
        // Handed back, it crosses as the other side's own request, with what that side keeps of it.
        came.set(request, one.own)
        return request
      }
    }
  }
  return walk(value)
}

/** An error as it crosses, and the one it stands for on the side it reaches. */
export const errorOut = (error: unknown): Crossed => crossed(error)
export const errorIn = (failed: Crossed): Error => revived(failed)
