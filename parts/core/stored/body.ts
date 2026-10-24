import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import type { Told } from './shared.ts'
import { handedNames, insideOf, ms, optionsOf, throughLinks } from './shared.ts'

const writing = ['add', 'change', 'remove']

/** What is seen of a body: the tables it reads and writes, and whether it calls code that says neither. */
interface Seen {
  reads: Set<string>
  touches: Set<string>
  unknown: boolean
  called: Set<string>
}

/** The table a chain of a body starts at, where it starts at one. */
function startOf(plan: unknown): string | undefined {
  const start = optionsOf(plan)
  return typeof start.db === 'string' ? start.db : typeof start.table === 'string' ? start.table : undefined
}

/** Notes what one function that a body calls reads and writes: a plain one by what it holds, and a code one by what it states. */
function calledOf(told: Told, name: string, seen: Seen): void {
  if (seen.called.has(name)) return
  seen.called.add(name)
  const called = told.all.get(name)
  if (!called || !['query', 'change', 'action'].includes(called.kind)) return
  const o = called.options
  const body = called.loaded.bodies?.run
  for (const table of [o.rows, o.set].flatMap((written) => tablesWritten(told, written))) seen.reads.add(table)
  for (const write of Array.isArray(o.set) ? o.set : [o.set])
    for (const word of writing) if (isStored(write) && typeof write[word] === 'string') seen.touches.add(write[word])
  if (o.run !== undefined && Array.isArray(body)) seenInBody(told, body, seen)
  else if (o.run !== undefined) {
    if (o.reads === undefined && o.touches === undefined) seen.unknown = true
    for (const table of namesIn(o.reads)) seen.reads.add(table)
    for (const table of namesIn(o.touches)) seen.touches.add(table)
  }
}

// An entry that is no name is reported where its option is stored, and is none of the tables here.
const namesIn = (written: unknown): string[] => (handedNames(written) ?? []).filter((name) => name !== '')

/** The tables of a plan or of writes as a word answered them: the table of each, and of each plan within. */
function tablesWritten(told: Told, written: unknown): string[] {
  const found: string[] = []
  const within = (value: unknown): void => {
    if (Array.isArray(value)) for (const one of value) within(one)
    else if (isStored(value)) {
      if (isStored(value.plan) && typeof value.plan.from === 'string') within(value.plan)
      if (typeof value.from === 'string') {
        found.push(value.from)
        for (const column of Array.isArray(value.with) ? value.with : [])
          found.push(...throughLinks(told, value.from, String(column).split('.')))
      }
      for (const one of insideOf(value)) if (typeof one !== 'function') within(one)
    }
  }
  within(written)
  return found
}

/** Walks a stored body, and notes every table that a chain of it starts at or writes, and every function it calls. */
function seenInBody(told: Told, node: unknown, seen: Seen): void {
  if (Array.isArray(node)) {
    for (const one of node) seenInBody(told, one, seen)
    return
  }
  if (!isStored(node)) return
  const table = startOf(node.plan)
  if (table !== undefined) {
    const members = Array.isArray(node.then) ? node.then : []
    // A chain that ends in a write starts at its table, which is no read of it.
    const writes = writing.includes(String(Object.keys(optionsOf(members.at(-1)))[0]))
    if (writes) seen.touches.add(table)
    else seen.reads.add(table)
    for (const step of members) {
      const [member, args] = Object.entries(optionsOf(step))[0] ?? []
      if (member === 'with')
        for (const column of Array.isArray(args) ? args : [])
          if (typeof column === 'string')
            for (const one of throughLinks(told, table, column.split('.'))) seen.reads.add(one)
    }
  }
  const call = optionsOf(node.call)
  if (typeof call.function === 'string' && call.member === undefined) calledOf(told, call.function, seen)
  for (const one of Object.values(node)) seenInBody(told, one, seen)
}

/**
 * Takes a body as the build read it. Answers what the description knows of it: `reads` and `touches`, every table
 * that a chain of the body starts at or writes, the tables a `with` of it may reach, and those of each plain
 * function it calls, however deep. Where it calls a code function that states neither, both are left out.
 */
export function bodyOf(told: Told, body: unknown[]): { reads?: string[]; touches?: string[] } {
  const seen: Seen = { reads: new Set(), touches: new Set(), unknown: false, called: new Set([told.name]) }
  seenInBody(told, body, seen)
  if (seen.unknown) return {}
  const only = (tables: Set<string>) => (tables.size ? [...tables] : undefined)
  return {
    ...(only(seen.reads) ? { reads: only(seen.reads) } : {}),
    ...(only(seen.touches) ? { touches: only(seen.touches) } : {}),
  }
}

/** The name of a step tool as a body calls it, with what its first value says. */
function stepOf(node: Stored): { name: string } | undefined {
  const fn = String(node.fn)
  const args = Array.isArray(node.args) ? node.args : []
  const named = (from: number) => {
    const o = args.slice(from).find((one) => isStored(one) && Array.isArray(one.object))
    const entry =
      isStored(o) && Array.isArray(o.object)
        ? o.object.find((one) => Array.isArray(one) && one[0] === 'name')
        : undefined
    return Array.isArray(entry) && typeof entry[1] === 'string' ? entry[1] : undefined
  }
  if (fn === 'step' || fn === 'step.many') return { name: String(args[0]) }
  if (fn === 'step.wait') return { name: named(1) ?? 'wait' }
  if (fn === 'step.waitFor') {
    const what = args[0]
    const event = isStored(what) && what.fn === 'event' && Array.isArray(what.args) ? what.args[0] : what
    return { name: named(1) ?? String(event) }
  }
  if (fn === 'step.now' || fn === 'step.random' || fn === 'step.done') return { name: fn.slice('step.'.length) }
  return undefined
}

/**
 * Takes the body of a flow as the build read it. Answers its step names in the order they stand, each marked as
 * repeated where it stands in a repeat or in an arrow that is run for each entry of a list.
 */
export function stepNamesOf(body: unknown, repeated = false, found: Stored[] = []): Stored[] {
  if (Array.isArray(body)) {
    for (const one of body) stepNamesOf(one, repeated, found)
    return found
  }
  if (!isStored(body)) return found
  const step = typeof body.fn === 'string' ? stepOf(body) : undefined
  if (step && !found.some((one) => one.name === step.name && one.repeated === (repeated ? true : undefined)))
    found.push(repeated ? { repeated: true, ...step } : step)
  const loops =
    typeof body.for === 'string' ||
    (typeof body.fn === 'string' &&
      ['each', 'step.all', 'step.first'].includes(body.fn) &&
      Array.isArray(body.args) &&
      body.args.length > 1)
  for (const one of Object.values(body)) stepNamesOf(one, repeated || loops, found)
  return found
}

/** The entries of an object the author wrote, as it is stored, or nothing for any other value. */
const objectEntries = (value: unknown): unknown[] | undefined =>
  isStored(value) && Array.isArray(value.object) ? value.object : undefined

/** Turns the written length of one entry of the options of a step into milliseconds, where the entry holds one. */
function inMs(told: Told, step: string, entry: unknown, names: readonly string[]): void {
  if (!Array.isArray(entry) || !names.includes(String(entry[0])) || typeof entry[1] !== 'string') return
  const made = ms(told, `${String(entry[0])} of the step ${step}`, entry[1])
  if (made !== undefined) entry[1] = made
}

/** Walks a stored body, and turns the lengths that the options of each step state into milliseconds. */
function stepLengths(told: Told, node: unknown): void {
  if (Array.isArray(node)) for (const one of node) stepLengths(told, one)
  if (!isStored(node)) return
  const [name, , options] = node.fn === 'step' && Array.isArray(node.args) ? node.args : []
  for (const entry of objectEntries(options) ?? []) {
    inMs(told, String(name), entry, ['time', 'reserve'])
    if (Array.isArray(entry) && entry[0] === 'remember')
      for (const kept of objectEntries(entry[1]) ?? []) inMs(told, String(name), kept, ['for'])
  }
  for (const one of Object.values(node)) stepLengths(told, one)
}

/**
 * Takes a body as the build read it. Answers the body as it is stored: a copy, in which `time` and `reserve` of a
 * step, and `for` of its `remember`, are milliseconds where they were written as a length of time. A length that
 * is worked out stays as it is. Reports a written length that does not read (T1011).
 */
export function storedBody(told: Told, body: unknown[]): unknown[] {
  const stored: unknown[] = structuredClone(body)
  stepLengths(told, stored)
  return stored
}
