import type { Description } from '../description.ts'
import { objectOf, valuesOfEntries } from '../madeValues.ts'
import { sequencePlace } from '../placeRead.ts'
import { isStored } from '../record.ts'
import { isSign, negated, signed } from '../signs.ts'
import type { LineTold } from '../toolLine.ts'
import { valueWords } from '../valueWords.ts'
import { written } from '../write.ts'
import { toolAsks } from './tools.ts'

/** The mark of a value that the walk does not know: the answer of a call that is not made, and what is worked out from it. */
const notKnown = Symbol('not known')

/** One call that the walk lists: the step it will be, its tool, its input as values, and whether it asks. */
export interface Listed {
  step: string
  tool: string
  input: unknown
  asks: boolean
  agreed?: boolean
}

/** What the walk is handed beside the sequence: what a tool's line is handed, the place of the sequence, and more. */
export type WalkOptions = LineTold & {
  at: [number, number]
  within?: number[]
  agreed?: { step: string; input: unknown }[]
  tick?(): void
}

/** What the walk holds while it goes: what it was handed, and what it found. */
interface Walking {
  description: Description
  agent: string
  saved: Record<string, unknown>
  o: WalkOptions
  calls: Listed[]
  more: boolean
}

/** Where a call stands: the place of the entry of an `all`, and the counter of that place. */
interface Scope {
  at: number[]
  count: { n: number }
}

type Names = Map<string, unknown>

/** Thrown where the walk ends before the end of the sequence: with more where calls may follow. */
class Ended {
  more: boolean

  /** Takes whether calls may follow where the walk ended. */
  constructor(more: boolean) {
    this.more = more
  }
}

const listOf = (node: unknown): unknown[] => (Array.isArray(node) ? node : [])

/** Whether a value is not known, or holds a value that is not known in a field or an entry. */
function unknownIn(value: unknown): boolean {
  if (value === notKnown) return true
  if (Array.isArray(value)) return value.some(unknownIn)
  if (typeof value !== 'object' || value === null || typeof value === 'function') return false
  return Object.values(value).some(unknownIn)
}

/** Whether a stored form holds a call, a `fill`, an `all` or a `return`, at any depth: what a choice decides on. */
function holds(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(holds)
  if (!isStored(node)) return false
  if ('return' in node || (isStored(node.call) && 'tool' in node.call)) return true
  if (node.fn === 'fill' || node.fn === 'all') return true
  return Object.values(node).some(holds)
}

/** Asks the tick, and ends the walk where it is past its pass. */
function ticked(w: Walking): void {
  try {
    w.o.tick?.()
  } catch {
    throw new Ended(true)
  }
}

const startsWith = (at: number[], within: number[]): boolean => within.every((n, i) => at[i] === n)

/** Meets one call of a tool: its saved answer, or the mark, and it is listed where its input is wholly known. */
function called(w: Walking, tool: string, input: unknown, scope: Scope): unknown {
  const at = [...scope.at, ++scope.count.n]
  const step = `tool ${w.o.at.join('.')}.${at.join('.')} ${tool}`
  if (Object.hasOwn(w.saved, step)) return w.saved[step]
  const listable = !w.o.within || startsWith(at, w.o.within)
  if (unknownIn(input)) {
    if (listable) w.more = true
    return notKnown
  }
  if (!listable) return notKnown
  const asks = toolAsks(w.description, w.agent, tool, w.o)
  const agreed = w.o.agreed?.some(
    (one) => one.step === step && written(one.input, undefined) === written(input, undefined),
  )
  w.calls.push({ step, tool, input, asks, ...(agreed ? { agreed: true } : {}) })
  return notKnown
}

/** Reads into a value by a stored path, as a body reads; a read into what is not known is not known. */
function readInto(w: Walking, from: unknown, path: unknown[], names: Names, scope: Scope): unknown {
  let current = from
  let maybe = false
  for (const raw of path) {
    if (current === notKnown) return notKnown
    if (raw === '?') {
      maybe = true
      continue
    }
    const asked = typeof raw === 'string' && raw.startsWith('?')
    if ((maybe || asked) && (current === undefined || current === null)) return undefined
    maybe = false
    const place = asked ? raw.slice(1) : isStored(raw) ? value(w, raw, names, scope) : raw
    if (place === notKnown) return notKnown
    if (current === undefined || current === null) throw new Ended(true)
    try {
      current = sequencePlace(current, place)
    } catch {
      throw new Ended(true)
    }
  }
  return current
}

/** The function of a stored arrow, which walks its statements in the place where it stands. */
const arrowOf =
  (w: Walking, node: Record<string, unknown>, names: Names, scope: Scope) =>
  (...args: unknown[]): unknown => {
    const inside: Names = new Map(names)
    for (const [i, name] of listOf(node.arrow).entries()) inside.set(String(name), args[i])
    return statements(w, listOf(node.do), inside, scope)?.value
  }

/** Walks an `all`: its entries one by one, each in the place of its entry, and ends past the entry it stays within. */
function allWalked(w: Walking, node: Record<string, unknown>, names: Names, scope: Scope): unknown {
  const [listed, arrow] = listOf(node.args)
  const at = [...scope.at, ++scope.count.n]
  const list = value(w, listed, names, scope)
  if (list === notKnown || !Array.isArray(list) || !isStored(arrow)) throw new Ended(true)
  return list.map((entry, i) => {
    ticked(w)
    const place = [...at, i + 1]
    const made = arrowOf(w, arrow, names, { at: place, count: { n: 0 } })(entry, i)
    if (w.o.within && w.o.within.length === place.length && startsWith(place, w.o.within)) throw new Ended(true)
    return made
  })
}

/** Walks a call of a word: `fill`, `all`, `each`, `fail`, and the value words, which answer what is not known where a value they are handed is not. */
function wordWalked(w: Walking, node: Record<string, unknown>, names: Names, scope: Scope): unknown {
  const name = String(node.fn)
  if (name === 'all') return allWalked(w, node, names, scope)
  if (name === 'fill') {
    const step = `fill ${w.o.at.join('.')}.${[...scope.at, ++scope.count.n].join('.')}`
    return Object.hasOwn(w.saved, step) ? w.saved[step] : notKnown
  }
  if (name === 'fail') throw new Ended(false)
  const args = listOf(node.args)
  if (name === 'each') {
    const list = value(w, args[0], names, scope)
    if (list === notKnown) {
      if (holds(args[1])) throw new Ended(true)
      return notKnown
    }
    const arrow = value(w, args[1], names, scope)
    if (!Array.isArray(list) || typeof arrow !== 'function') throw new Ended(true)
    return list.map((entry, i) => {
      ticked(w)
      return Reflect.apply(arrow, undefined, [entry, i])
    })
  }
  const values = args.map((one) => value(w, one, names, scope))
  if (values.some(unknownIn)) return notKnown
  if (!Object.hasOwn(valueWords, name)) throw new Ended(true)
  try {
    return valueWords[name](() => ticked(w), ...values)
  } catch (thrown) {
    if (thrown instanceof Ended) throw thrown
    throw new Ended(true)
  }
}

/** Walks a sign: a side that decides is not known where a side that holds a call would follow. */
function signWalked(w: Walking, node: Record<string, unknown>, names: Names, scope: Scope): unknown {
  const op = String(node.op)
  const left = value(w, node.left, names, scope)
  const lazy = op === '&&' || op === '||' || op === '??'
  if (lazy) {
    if (left === notKnown) {
      if (holds(node.right)) throw new Ended(true)
      return notKnown
    }
    const takesRight = op === '&&' ? Boolean(left) : op === '||' ? !left : left === undefined || left === null
    return takesRight ? value(w, node.right, names, scope) : left
  }
  const right = value(w, node.right, names, scope)
  if (unknownIn(left) || unknownIn(right) || !isSign(op)) return notKnown
  try {
    return signed(op, left, right)
  } catch {
    throw new Ended(true)
  }
}

/** Walks one stored value, as `runBody` works it out, with the mark for what the walk does not know. */
function value(w: Walking, node: unknown, names: Names, scope: Scope): unknown {
  if (Array.isArray(node)) return node.map((one) => value(w, one, names, scope))
  if (!isStored(node)) return node
  if ('await' in node) return value(w, node.await, names, scope)
  if ('name' in node) {
    const [first, ...path] = listOf(node.name)
    if (!names.has(String(first))) throw new Ended(true)
    return readInto(w, names.get(String(first)), path, names, scope)
  }
  if ('read' in node) return readInto(w, value(w, node.read, names, scope), listOf(node.path), names, scope)
  if ('call' in node && isStored(node.call)) {
    const input = value(w, listOf(node.args)[0], names, scope)
    return called(w, String(node.call.tool), input ?? {}, scope)
  }
  if ('fn' in node) return wordWalked(w, node, names, scope)
  if ('op' in node) return signWalked(w, node, names, scope)
  if ('object' in node) {
    const entries = listOf(node.object)
    const made = objectOf(
      entries,
      valuesOfEntries(entries).map((one) => value(w, one, names, scope)),
    )
    return unknownIn(made) ? notKnown : made
  }
  if ('text' in node) {
    const parts = listOf(node.text).map((one) => (typeof one === 'string' ? one : value(w, one, names, scope)))
    return parts.some(unknownIn) ? notKnown : parts.map(String).join('')
  }
  if ('if' in node) {
    const test = value(w, node.if, names, scope)
    if (test === notKnown) {
      if (holds(node.then) || holds(node.else)) throw new Ended(true)
      return notKnown
    }
    return value(w, test ? node.then : node.else, names, scope)
  }
  if ('not' in node) {
    const inner = value(w, node.not, names, scope)
    return inner === notKnown ? notKnown : !inner
  }
  if ('minus' in node) {
    const inner = value(w, node.minus, names, scope)
    return unknownIn(inner) ? notKnown : negated(inner)
  }
  if ('arrow' in node) return arrowOf(w, node, names, scope)
  if ('type' in node) return node.type
  if ('types' in node) return node.types
  return undefined
}

/** Walks a list of stored statements. Answers the value of a `return`, or nothing where it ran to its end. */
function statements(w: Walking, list: unknown[], around: Names, scope: Scope): { value: unknown } | undefined {
  const names: Names = new Map(around)
  for (const statement of list) {
    ticked(w)
    if (!isStored(statement)) throw new Ended(true)
    if ('const' in statement) {
      const made = value(w, statement.value, names, scope)
      if (typeof statement.const === 'string') names.set(statement.const, made)
      else for (const one of listOf(statement.const)) names.set(String(one), readInto(w, made, [one], names, scope))
    } else if ('for' in statement) {
      const over = value(w, statement.of, names, scope)
      if (over === notKnown) {
        if (holds(statement.do)) throw new Ended(true)
        continue
      }
      if (!Array.isArray(over) && typeof over !== 'string') throw new Ended(true)
      for (const entry of over) {
        ticked(w)
        const ended = statements(w, listOf(statement.do), new Map([...names, [String(statement.for), entry]]), scope)
        if (ended) return ended
      }
    } else if ('if' in statement) {
      const test = value(w, statement.if, names, scope)
      if (test === notKnown) {
        if (holds(statement.then) || holds(statement.else)) throw new Ended(true)
        continue
      }
      const ended = statements(w, listOf(test ? statement.then : statement.else), names, scope)
      if (ended) return ended
    } else if ('return' in statement) return { value: value(w, statement.return, names, scope) }
    else value(w, statement.do, names, scope)
  }
  return undefined
}

/**
 * Takes a description, an agent, the stored form of a sequence, the saved results of its steps by their
 * names, and what the walk is handed. Answers what the sequence will do next, without doing it: it is carried out
 * from its top as `runBody` carries it out, a saved call answers what was saved, and a call that is not saved is
 * not made and answers the mark of what is not known. Each call met that is not saved and whose input is wholly
 * known is listed; one whose input is not is passed over, and `more` is then true. The walk ends at the end of the
 * sequence, or with `more` where it is not known whether, or how often, a call is reached, and where its tick
 * throws.
 */
export function walkSequence(
  description: Description,
  agent: string,
  body: object[],
  saved: Record<string, unknown>,
  o: WalkOptions,
): { calls: Listed[]; more: boolean } {
  const w: Walking = { description, agent, saved, o, calls: [], more: false }
  try {
    statements(w, body, new Map(), { at: [], count: { n: 0 } })
  } catch (thrown) {
    if (!(thrown instanceof Ended)) throw thrown
    if (thrown.more) w.more = true
  }
  return { calls: w.calls, more: w.more }
}
