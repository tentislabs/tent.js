import { calls } from './definition.ts'
import { TentError } from './errors.ts'
import { member } from './handle.ts'
import { emit } from './helpers/emit.ts'
import { fail } from './helpers/fail.ts'
import { given } from './helpers/references.ts'
import { start } from './helpers/start.ts'
import { event } from './helpers/triggers.ts'
import { isObject, own } from './own.ts'
import { tableMembers } from './plan.ts'
import type { Stored } from './record.ts'
import { isStored } from './record.ts'
import { runtime } from './runtime.ts'
import { isSign, negated, signed } from './signs.ts'
import { calc } from './values/calc.ts'
import { concat } from './values/concat.ts'
import { dayOf } from './values/dayOf.ts'
import { now } from './values/now.ts'
import { random } from './values/random.ts'
import { valueWords } from './valueWords.ts'
import { keyOf, placeOf, throughRuntime } from './placeRead.ts'
import { listed, objectOf, textWith, valuesOfEntries } from './madeValues.ts'
import type { InSequence } from './sequence/doors.ts'
import { allDoor, toolDoor, wordDoor } from './sequence/doors.ts'

/** The names that a stored form reads, each with its value. A name of a block hides the same name around it. */
type Names = Record<string, unknown>

/** What carrying a stored form out is handed, and what it keeps while it does. */
export interface Carrying {
  tick?: () => void
  ref?: (ref: object) => unknown
  zone?: string
  // The chains that its own calls made, each with where it started: through `db`, or at a table that the file imports.
  chains: WeakMap<object, 'db' | 'table'>
  // What the engine handed out, and what was read of it: a name is read on each as a member of its own.
  handedOut: WeakSet<object>
  // In a sequence of an agent: its doors, the place of the entry it stands in, and its counter.
  sequence?: InSequence
}

type Stepped = Generator<unknown, unknown, unknown>

/** Throws T0011: a stored form that the description does not have, or that cannot be carried out where it stands. */
function refused(what: string): never {
  throw new TentError('T0011', `A stored value cannot be carried out: ${what}.`)
}

const waiting = new WeakMap<object, boolean>()

/** Whether a stored form holds an `await` of its own. One inside an arrow belongs to the arrow. */
function waits(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) return false
  const known = waiting.get(node)
  if (known !== undefined) return known
  const holds = Array.isArray(node)
    ? node.some(waits)
    : 'await' in node || (!('arrow' in node) && !('named' in node) && Object.values(node).some(waits))
  waiting.set(node, holds)
  return holds
}

/** Makes the names of a body or of a block: those it is handed, over those around it. */
function namesOf(handed: Record<string, unknown>, around: Names | null = null): Names {
  const names: Names = Object.create(around)
  for (const [name, value] of Object.entries(handed)) names[name] = value
  return names
}

/** Reads a name. A name that nothing handed is not there: nothing of the runtime is ever read. */
function named(names: Names, name: unknown): unknown {
  if (typeof name !== 'string' || !(name in names)) throw new ReferenceError(`${String(name)} is not defined`)
  return names[name]
}

/** Reads one place of a value. On what the engine handed out a name is a member of its own, or it is not there. */
function read(value: unknown, place: unknown, cx: Carrying): unknown {
  // A sequence that a model wrote never reads a place through which lies the runtime itself.
  if (cx.sequence && throughRuntime(place)) return undefined
  if (!isObject(value) || !cx.handedOut.has(value)) return placeOf(value, place)
  const key = keyOf(place)
  const found = typeof key === 'string' ? own(value, key) : undefined
  if (isObject(found)) cx.handedOut.add(found)
  return found
}

/**
 * Reads into a value by a stored path: a name, a whole number, a place that is worked out, an entry that starts
 * with a question mark for a read with `?.`, and the entry `"?"` alone for `?.` in front of square brackets. A
 * place that holds an `await` is handed out and gone on from, as every value that holds one is.
 */
function* followed(from: unknown, path: unknown[], names: Names, cx: Carrying): Stepped {
  let current = from
  let maybe = false
  for (const entry of path) {
    if (entry === '?') {
      maybe = true
      continue
    }
    const asked = typeof entry === 'string' && entry.startsWith('?')
    if ((maybe || asked) && (current === undefined || current === null)) return undefined
    maybe = false
    const place = asked ? entry.slice(1) : isStored(entry) ? yield* either(entry, names, cx) : entry
    current = read(current, place, cx)
  }
  return current
}

/** Goes through steps that hand nothing out, and answers what they end with. An `await` among them is T0011. */
function atOnce<Answer>(steps: Generator<unknown, Answer, unknown>): Answer {
  const step = steps.next()
  return step.done ? step.value : refused('an await, which only a body carries out')
}

/** Reads into a value by a stored path that holds no `await`. */
const follow = (from: unknown, path: unknown[], names: Names, cx: Carrying): unknown =>
  atOnce(followed(from, path, names, cx))

/** The tools of `step`, by the names a body calls them under. */
const stepTools = ['wait', 'waitFor', 'all', 'first', 'many', 'now', 'random', 'done']

/** The words of ours that are no value word and no definition, which a body calls by their names. */
const others: Record<string, (...args: never[]) => unknown> = { fail, start, emit, given, event }

/** Calls a word of ours by the name its stored form holds, with its values worked out. */
function callWord(node: Stored, args: unknown[], names: Names, cx: Carrying): unknown {
  const name = String(node.fn)
  if (cx.sequence && (name === 'fill' || name === 'each')) return wordDoor(cx.sequence, name, args, cx.tick)
  // A `from` is worked out with the zone of the project, which the store hands on.
  if (name === 'dayOf' && args.length === 1 && cx.zone !== undefined)
    return Reflect.apply(dayOf, undefined, [args[0], cx.zone])
  if (Object.hasOwn(valueWords, name)) return valueWords[name](cx.tick, ...args)
  if (Object.hasOwn(others, name)) return Reflect.apply(others[name], undefined, args)
  if (name === 'step' || name.startsWith('step.')) {
    const toolName = name.slice('step.'.length)
    if (name !== 'step' && !stepTools.includes(toolName)) refused(`${name} is no tool of step`)
    const step = named(names, 'step')
    const tool = name === 'step' ? step : own(step, toolName)
    if (typeof tool !== 'function') throw new TypeError(`${name} is not a function`)
    return Reflect.apply(tool, step, args)
  }
  return refused(`${name} is no word that a body may call`)
}

/** The name a call reaches the runtime under: a definition, or a member of one, with a dot between. */
function calledName(call: Stored): string {
  if ('tool' in call) refused('a call of a tool, which only a sequence of an agent holds')
  const [kind] = ['function', 'flow', 'agent', 'service', 'model'].filter((one) => one in call)
  if (!kind) refused('a call that names no definition')
  const part = kind === 'service' || kind === 'model' ? call.call : call.member
  return part === undefined ? String(call[kind]) : `${String(call[kind])}.${String(part)}`
}

/** Calls a definition or a member of a handle, through the very functions that code calls. */
function callDefinition(node: Stored, args: unknown[], names: Names, cx: Carrying): unknown {
  const call = isStored(node.call) ? node.call : refused('a call that names nothing')
  if ('tool' in call && cx.sequence) return toolDoor(cx.sequence, String(call.tool), args[0])
  if (typeof call.builtin === 'string') {
    const [handle, ...rest] = call.builtin.split('.')
    const forward: (...values: unknown[]) => unknown = member(handle, rest.join('.'))
    return forward(...args)
  }
  const name = calledName(call)
  if (node.system !== true) return runtime(name).call(name, args)
  const asSystem = named(names, 'call')
  if (typeof asSystem !== 'function') throw new TypeError('call is not a function')
  return Reflect.apply(asSystem, undefined, [calls(name), ...args])
}

// The members of a chain through `db` that answer: what they give is a value, and no chain goes on from it.
const answering = ['all', 'first', 'count', 'get', 'history', 'add', 'change', 'remove']

/** Keeps a chain that a call of ours made, so that a chain may go on from it. */
function kept<Chain>(chain: Chain, from: 'db' | 'table', cx: Carrying): Chain {
  if (isObject(chain)) {
    cx.chains.set(chain, from)
    cx.handedOut.add(chain)
  }
  return chain
}

/** Answers where a stored chain starts: at a table of `db`, at a table that the file imports, or at a name that holds a chain. */
function chainStart(plan: unknown, names: Names, cx: Carrying): { chain: unknown; from: 'db' | 'table' } {
  if (!isStored(plan)) return refused('a chain that starts nowhere')
  if ('db' in plan) {
    const db = named(names, 'db')
    const tables = plan.system === true ? own(db, 'system') : db
    return { chain: kept(own(tables, String(plan.db)), 'db', cx), from: 'db' }
  }
  if ('table' in plan) return { chain: kept(tableMembers(String(plan.table)), 'table', cx), from: 'table' }
  const [first, ...path] = listed(plan.name)
  const chain = follow(named(names, first), path, names, cx)
  const from = isObject(chain) ? cx.chains.get(chain) : undefined
  if (!from) {
    throw new TentError('T0009', `A chain goes on from ${String(first)}, which holds no chain that db handed out.`)
  }
  return { chain, from }
}

/** Calls one member of a chain, and keeps what it answers where a chain may go on from it. */
function callMember(chain: unknown, from: 'db' | 'table', name: string, args: unknown[], cx: Carrying): unknown {
  const found = own(chain, name)
  if (typeof found !== 'function') throw new TypeError(`${name} is not a function`)
  const answered: unknown = Reflect.apply(found, chain, args)
  return from === 'table' || !answering.includes(name) ? kept(answered, from, cx) : answered
}

/** One member of a stored chain: its name, and its values as they are stored. */
function chainMember(step: unknown): [string, unknown[]] {
  const [entry] = isStored(step) ? Object.entries(step) : []
  return entry ? [entry[0], listed(entry[1])] : refused('a member of a chain with no name')
}

const definitions = ['function', 'flow', 'agent', 'service', 'model', 'table']

/** What a stored form that takes no value of its own to work out answers, or nothing where it is none of them. */
function plain(node: Stored, cx: Carrying): { value: unknown } | undefined {
  if ('nothing' in node) return { value: undefined }
  if ('setting' in node) {
    const name = String(node.setting)
    return { value: own(runtime(`settings.${name}`).handle('settings'), name) }
  }
  if ('type' in node) return { value: node.type }
  if ('types' in node) return { value: node.types }
  if ('now' in node) return { value: now() }
  if ('random' in node) return { value: random() }
  if ('input' in node || 'caller' in node || 'col' in node) return { value: cx.ref?.(node) }
  const [kind] = definitions.filter((one) => one in node)
  if (kind) {
    const name = node.member === undefined ? String(node[kind]) : `${String(node[kind])}.${String(node.member)}`
    return { value: Object.freeze({ definition: name }) }
  }
  return undefined
}

/** The sides of a sign that JavaScript works out only where it takes them. */
const lazy: Record<string, (left: unknown) => boolean> = {
  '&&': (left) => Boolean(left),
  '||': (left) => !left,
  '??': (left) => left === undefined || left === null,
}

/** Makes the function of a stored arrow: it is handed its names, and carries its statements out. */
function arrowOf(node: Stored, names: Names, cx: Carrying): (...args: unknown[]) => unknown {
  const body = listed(node.do)
  const held = listed(node.arrow).map(String)
  const waitsHere = node.waits === true || waits(body)
  return (...args) => {
    const inside = namesOf(Object.fromEntries(held.map((name, i) => [name, args[i]])), names)
    if (!waitsHere) return statements(body, inside, cx)?.value
    return drive(steppedStatements(body, inside, cx)).then((ended) => ended?.value)
  }
}

/** What makes the function of an arrow of an `all` for one entry: the arrow, where the entry of the sequence stands. */
const arrowIn =
  (names: Names, cx: Carrying) =>
  (arrow: Stored, inner: InSequence): ((...args: unknown[]) => unknown) =>
    arrowOf(arrow, names, { ...cx, sequence: inner })

/** Works one stored value out, where it holds no `await`. */
export function value(node: unknown, names: Names, cx: Carrying): unknown {
  if (Array.isArray(node)) return node.map((one) => value(one, names, cx))
  if (!isStored(node)) return node
  if ('name' in node) {
    const [first, ...path] = listed(node.name)
    return follow(named(names, first), path, names, cx)
  }
  if ('object' in node) return objectOf(listed(node.object), listed(value(valuesOfEntries(node.object), names, cx)))
  if ('call' in node) return callDefinition(node, listed(value(listed(node.args), names, cx)), names, cx)
  if (node.fn === 'all' && cx.sequence) {
    const [list, , options] = listed(node.args)
    return allDoor(cx.sequence, node, value(list, names, cx), value(options, names, cx), arrowIn(names, cx))
  }
  if ('fn' in node) return callWord(node, listed(value(listed(node.args), names, cx)), names, cx)
  if ('plan' in node) {
    const { chain, from } = chainStart(node.plan, names, cx)
    let current = chain
    for (const step of listed(node.then)) {
      const [name, args] = chainMember(step)
      current = callMember(current, from, name, listed(value(args, names, cx)), cx)
    }
    return current
  }
  if ('op' in node) {
    const left = value(node.left, names, cx)
    const op = String(node.op)
    if (Object.hasOwn(lazy, op)) return lazy[op](left) ? value(node.right, names, cx) : left
    return isSign(op) ? signed(op, left, value(node.right, names, cx)) : refused(`the sign ${op}`)
  }
  if ('text' in node) return textWith(listed(node.text), listed(value(listed(node.text), names, cx)))
  if ('read' in node) return follow(value(node.read, names, cx), listed(node.path), names, cx)
  if ('if' in node) return value(value(node.if, names, cx) ? node.then : node.else, names, cx)
  if ('not' in node) return !value(node.not, names, cx)
  if ('minus' in node) return negated(value(node.minus, names, cx))
  if ('arrow' in node) return arrowOf(node, names, cx)
  if ('named' in node) return value(node.value, names, cx)
  if ('concat' in node) return concat(...listed(value(listed(node.concat), names, cx)))
  if ('calc' in node)
    return Reflect.apply(calc, undefined, [node.calc, value(node.left, names, cx), value(node.right, names, cx)])
  if ('await' in node) return refused('an await, which only a body carries out')
  const found = plain(node, cx)
  return found ? found.value : refused(`the form with ${Object.keys(node).join(', ') || 'no member'}`)
}

/** Works one stored value out, or steps through it where it holds an `await`. */
function* either(node: unknown, names: Names, cx: Carrying): Stepped {
  return waits(node) ? yield* stepped(node, names, cx) : value(node, names, cx)
}

/** Works a list of stored values out, one after another. */
function* eitherAll(nodes: unknown[], names: Names, cx: Carrying): Generator<unknown, unknown[], unknown> {
  const values: unknown[] = []
  for (const node of nodes) values.push(yield* either(node, names, cx))
  return values
}

/**
 * Steps through a stored value that holds an `await`, part by part in JavaScript's order: it hands each awaited
 * value out and goes on with what it is handed back, and a call that is not awaited is made at its own place.
 */
function* stepped(node: unknown, names: Names, cx: Carrying): Stepped {
  if (Array.isArray(node)) return yield* eitherAll(node, names, cx)
  if (!isStored(node)) return node
  if ('await' in node) return yield yield* either(node.await, names, cx)
  if ('name' in node) {
    const [first, ...path] = listed(node.name)
    return yield* followed(named(names, first), path, names, cx)
  }
  if ('object' in node) return objectOf(listed(node.object), yield* eitherAll(valuesOfEntries(node.object), names, cx))
  if ('call' in node) return callDefinition(node, yield* eitherAll(listed(node.args), names, cx), names, cx)
  if (node.fn === 'all' && cx.sequence) {
    const [list, , options] = listed(node.args)
    const [over, given] = yield* eitherAll([list, options], names, cx)
    return allDoor(cx.sequence, node, over, given, arrowIn(names, cx))
  }
  if ('fn' in node) return callWord(node, yield* eitherAll(listed(node.args), names, cx), names, cx)
  if ('plan' in node) {
    const { chain, from } = chainStart(node.plan, names, cx)
    let current = chain
    for (const step of listed(node.then)) {
      const [name, args] = chainMember(step)
      current = callMember(current, from, name, yield* eitherAll(args, names, cx), cx)
    }
    return current
  }
  if ('op' in node) {
    const left = yield* either(node.left, names, cx)
    const op = String(node.op)
    if (Object.hasOwn(lazy, op)) return lazy[op](left) ? yield* either(node.right, names, cx) : left
    return isSign(op) ? signed(op, left, yield* either(node.right, names, cx)) : refused(`the sign ${op}`)
  }
  if ('text' in node) return textWith(listed(node.text), yield* eitherAll(listed(node.text), names, cx))
  if ('read' in node) return yield* followed(yield* either(node.read, names, cx), listed(node.path), names, cx)
  if ('if' in node) return yield* either((yield* either(node.if, names, cx)) ? node.then : node.else, names, cx)
  if ('not' in node) return !(yield* either(node.not, names, cx))
  if ('minus' in node) return negated(yield* either(node.minus, names, cx))
  return value(node, names, cx)
}

/** What ended a list of statements: the value of its `return`. Nothing where it ran to its end. */
type Ended = { value: unknown } | undefined

/** Gives the names of a `const` their values: one name, or the fields of a record by their own names. */
function setNames(names: Names, statement: Stored, made: unknown): void {
  if (Array.isArray(statement.const)) for (const name of statement.const) names[String(name)] = placeOf(made, name)
  else names[String(statement.const)] = made
}

/** The entries of what a repeat walks: a list, a text as JavaScript walks it, and anything else that can be walked. */
function walked(over: unknown): Iterable<unknown> {
  if (typeof over === 'string' || Array.isArray(over)) return over
  if (isIterable(over)) return over
  throw new TypeError(`${typeof over === 'object' && over !== null ? 'the value' : String(over)} is not iterable`)
}

const isIterable = (over: unknown): over is Iterable<unknown> =>
  isObject(over) && typeof Reflect.get(over, Symbol.iterator) === 'function'

/** Carries a list of stored statements out, at once. */
export function statements(list: unknown[], names: Names, cx: Carrying): Ended {
  for (const statement of list) {
    cx.tick?.()
    if (!isStored(statement)) refused('a statement that is no record')
    if (typeof statement.line === 'number') cx.sequence?.doors.line?.(statement.line)
    if ('const' in statement) setNames(names, statement, value(statement.value, names, cx))
    else if ('for' in statement) {
      for (const entry of walked(value(statement.of, names, cx))) {
        cx.tick?.()
        const ended = statements(listed(statement.do), namesOf({ [String(statement.for)]: entry }, names), cx)
        if (ended) return ended
      }
    } else if ('return' in statement) return { value: value(statement.return, names, cx) }
    else if ('if' in statement) {
      const side = value(statement.if, names, cx) ? statement.then : statement.else
      const ended = side === undefined ? undefined : statements(listed(side), namesOf({}, names), cx)
      if (ended) return ended
    } else if ('do' in statement) value(statement.do, names, cx)
    else refused(`the statement with ${Object.keys(statement).join(', ') || 'no member'}`)
  }
  return undefined
}

/** Steps through a list of stored statements of which one holds an `await`. */
export function* steppedStatements(list: unknown[], names: Names, cx: Carrying): Generator<unknown, Ended, unknown> {
  for (const statement of list) {
    cx.tick?.()
    if (!isStored(statement)) refused('a statement that is no record')
    if (typeof statement.line === 'number') cx.sequence?.doors.line?.(statement.line)
    if ('const' in statement) setNames(names, statement, yield* either(statement.value, names, cx))
    else if ('for' in statement) {
      for (const entry of walked(yield* either(statement.of, names, cx))) {
        cx.tick?.()
        const inside = namesOf({ [String(statement.for)]: entry }, names)
        const ended = yield* steppedStatements(listed(statement.do), inside, cx)
        if (ended) return ended
      }
    } else if ('return' in statement) return { value: yield* either(statement.return, names, cx) }
    else if ('if' in statement) {
      const side = (yield* either(statement.if, names, cx)) ? statement.then : statement.else
      const ended = side === undefined ? undefined : yield* steppedStatements(listed(side), namesOf({}, names), cx)
      if (ended) return ended
    } else if ('do' in statement) yield* either(statement.do, names, cx)
    else refused(`the statement with ${Object.keys(statement).join(', ') || 'no member'}`)
  }
  return undefined
}

/** Goes through the steps of a stored form that waits: it awaits what each step hands out, and hands the value back. */
export async function drive<Answer>(steps: Generator<unknown, Answer, unknown>): Promise<Answer> {
  let step = steps.next()
  while (!step.done) {
    let handed: unknown
    let failed = false
    try {
      handed = await step.value
    } catch (thrown) {
      handed = thrown
      failed = true
    }
    step = failed ? steps.throw(handed) : steps.next(handed)
  }
  return step.value
}

/** Whether a list of stored statements holds an `await` of its own. */
export const holdsAwait = (body: unknown[]): boolean => waits(body)

/** Makes the first names of a stored form: what it is handed, and nothing of the runtime. */
export const firstNames = (handed: Record<string, unknown>): Names => namesOf(handed)

/**
 * Takes what a stored form is handed, and what it is carried out with. Answers what carrying it out keeps: no chain
 * yet, and `db` and `step` as what the engine handed out.
 */
export function carrying(
  handed: Record<string, unknown>,
  o: { tick?: () => void; ref?: (ref: object) => unknown; zone?: string; sequence?: InSequence },
): Carrying {
  const handedOut = new WeakSet<object>()
  for (const name of ['db', 'step']) {
    const thing = Object.hasOwn(handed, name) ? handed[name] : undefined
    if (isObject(thing)) handedOut.add(thing)
  }
  return { ...o, chains: new WeakMap(), handedOut }
}
