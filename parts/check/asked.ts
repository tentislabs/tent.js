import type { Description } from '../core/internal.ts'
import { inside } from './rule.ts'
import { isStored } from '../core/internal.ts'

/** What the check can see of a value that is handed to a vector column: the input it is, its length as a written list, or the model whose `embed` made it. */
export interface Handed {
  input?: string
  length?: number
  embed?: string
}

/** One read or write of rows that a definition holds, in whichever form it was written. */
export interface Asked {
  definition: string
  table: string
  // The plan of `rows` itself, and no plan inside it.
  top: boolean
  // Carried out with full access: through `db.system`, or by a `set` of a function that states `system`.
  system: boolean
  // It stands in a `where` rule of a table, and inside `in`.
  inRule: boolean
  inIn: boolean
  filters: { column: string; op: string }[]
  sorts: string[]
  groups: string[]
  // The columns that a value of a group is worked out from.
  worked: string[]
  picks: string[]
  // What the plan is made of beside its table: `where`, `search`, `sort`, `limit`, `first` and the others.
  joins: string[]
  near?: { column: string; value: Handed }
  write?: { kind: 'add' | 'change' | 'remove'; values: Record<string, Handed> }
}

/** Where a plan or a chain was found. */
type Found = Pick<Asked, 'definition' | 'top' | 'system' | 'inRule' | 'inIn'>

const fresh = (found: Found, table: string): Asked => ({
  ...found,
  table,
  filters: [],
  sorts: [],
  groups: [],
  worked: [],
  picks: [],
  joins: [],
})

const textsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one) => typeof one === 'string') : typeof value === 'string' ? [value] : []

/** What a stored value is, where it is handed to a vector column. */
const handedValue = (value: unknown): Handed =>
  Array.isArray(value)
    ? { length: value.length }
    : isStored(value) && typeof value.input === 'string'
      ? { input: value.input }
      : {}

/** The columns that the values of a group are worked out from, in either stored form. */
function workedOf(values: unknown): string[] {
  const found: string[] = []
  inside(values, (record) => {
    for (const word of ['sum', 'avg', 'min', 'max']) {
      if (typeof record[word] === 'string') found.push(record[word])
      if (record.fn === word && Array.isArray(record.args) && record.args.length === 1)
        found.push(...textsOf(record.args))
    }
  })
  return found
}

/** Reads the plans of a description that are stored as records: of `rows`, of `set`, and of a rule written as a value. */
function stored(all: Asked[]): {
  plan(record: Record<string, unknown>, found: Found): void
  filter(filter: unknown, asked: Asked): void
} {
  const filter = (given: unknown, asked: Asked): void => {
    if (!isStored(given)) return
    for (const group of [given.any, given.all]) if (Array.isArray(group)) for (const one of group) filter(one, asked)
    if (isStored(given.not) && given.col === undefined) filter(given.not, asked)
    if (typeof given.col !== 'string') return
    for (const [op, value] of Object.entries(given)) {
      if (op === 'col' || op === 'given') continue
      asked.filters.push({ column: given.col, op })
      if (op === 'in' && isStored(value) && typeof value.from === 'string')
        plan(value, {
          definition: asked.definition,
          top: false,
          system: asked.system,
          inRule: asked.inRule,
          inIn: true,
        })
    }
  }
  const plan = (record: Record<string, unknown>, found: Found): void => {
    const asked = fresh(found, String(record.from))
    all.push(asked)
    if (record.where !== undefined) asked.joins.push('where')
    filter(record.where, asked)
    for (const one of Array.isArray(record.sort) ? record.sort : [])
      if (isStored(one) && typeof one.by === 'string') asked.sorts.push(one.by)
    if (asked.sorts.length) asked.joins.push('sort')
    if (isStored(record.group)) {
      asked.groups.push(...textsOf(record.group.by))
      asked.worked.push(...workedOf(record.group.values))
      asked.joins.push('group')
    }
    asked.picks.push(...textsOf(record.pick))
    for (const name of ['search', 'limit', 'skip', 'after', 'with', 'pick'])
      if (record[name] !== undefined) asked.joins.push(name)
    if (record.count === true) asked.joins.push('count')
    if (record.one === 'get' || record.one === 'first') asked.joins.push(record.one)
    if (isStored(record.near) && typeof record.near.col === 'string')
      asked.near = { column: record.near.col, value: handedValue(record.near.value) }
  }
  return { plan, filter }
}

// The words of a filter that stand between a column and what it is held against.
const ops = new Set([
  ...['is', 'above', 'atLeast', 'below', 'atMost', 'not', 'in', 'contains', 'startsWith'],
  ...['before', 'after', 'empty', 'filled'],
])

/** The entries of an object that a body writes, each a key and its value, or none for any other value. */
const entries = (value: unknown): [string, unknown][] =>
  isStored(value) && Array.isArray(value.object)
    ? value.object.filter((one): one is [string, unknown] => Array.isArray(one) && typeof one[0] === 'string')
    : []

/**
 * Reads the chains that a stored body holds, each as it goes on from `db`, from a table, or from a name of the
 * body. Handed the table of a rule, it reads the body as the filter that the arrow of the rule gives.
 */
function chains(all: Asked[], body: unknown, found: Found, ruleOf?: string): void {
  const names = new Map<string, unknown>()
  const records: Record<string, unknown>[] = []
  inside(body, (record) => {
    if (typeof record.const === 'string') names.set(record.const, record.value)
    if (isStored(record.plan) && Array.isArray(record.then)) records.push(record)
  })
  const awaited = (value: unknown): unknown => (isStored(value) && value.await !== undefined ? value.await : value)
  // A chain that another one goes on from is read as the start of that one, and not by itself.
  const goneOn = new Set<unknown>()
  for (const record of records) {
    const start = isStored(record.plan) ? record.plan.name : undefined
    if (Array.isArray(start) && start.length === 1) goneOn.add(awaited(names.get(String(start[0]))))
  }
  const insideIn = new Set<unknown>()

  /** What a value of a body is, where it is handed to a vector column. */
  const handed = (value: unknown, depth = 0): Handed => {
    const given = awaited(value)
    if (Array.isArray(given)) return { length: given.length }
    if (!isStored(given) || depth > 8) return {}
    if (isStored(given.call) && typeof given.call.model === 'string' && given.call.call === 'embed')
      return { embed: given.call.model }
    if (!Array.isArray(given.name)) return {}
    const [first, second] = given.name
    if (first === 'input' && typeof second === 'string' && given.name.length === 2) return { input: second }
    return given.name.length === 1 && names.has(String(first)) ? handed(names.get(String(first)), depth + 1) : {}
  }

  /** The table a chain starts at, whether it has full access, and its members from its start on. */
  const whole = (
    record: Record<string, unknown>,
    depth = 0,
  ): { table: string; system: boolean; members: unknown[] } | undefined => {
    const start = isStored(record.plan) ? record.plan : {}
    const members = Array.isArray(record.then) ? record.then : []
    const table = typeof start.db === 'string' ? start.db : typeof start.table === 'string' ? start.table : undefined
    if (table !== undefined) return { table, system: start.system === true, members }
    const from = Array.isArray(start.name) && start.name.length === 1 ? awaited(names.get(String(start.name[0]))) : 0
    const before = isStored(from) && isStored(from.plan) && depth < 8 ? whole(from, depth + 1) : undefined
    return before ? { ...before, members: [...before.members, ...members] } : undefined
  }

  const filter = (given: unknown, asked: Asked): void => {
    for (const [key, value] of entries(given)) {
      if (key === 'any' || key === 'all') for (const one of Array.isArray(value) ? value : []) filter(one, asked)
      else if (key === 'not') filter(value, asked)
      else {
        const stated = entries(value)
        const words: [string, unknown][] =
          stated.length && stated.every(([op]) => ops.has(op)) ? stated : [['is', value]]
        for (const [op, held] of words) {
          asked.filters.push({ column: key, op })
          if (op === 'in' && isStored(held) && isStored(held.plan)) insideIn.add(held)
        }
      }
    }
  }

  // The arrow of a rule gives the filter of its own table.
  if (ruleOf !== undefined) {
    const asked = fresh(found, ruleOf)
    all.push(asked)
    filter(body, asked)
  }
  for (const record of records) {
    if (goneOn.has(record)) continue
    const chain = whole(record)
    if (!chain) continue
    const asked = fresh({ ...found, system: chain.system, inIn: found.inIn || insideIn.has(record) }, chain.table)
    all.push(asked)
    for (const member of chain.members) {
      const [name, args] = isStored(member) ? (Object.entries(member)[0] ?? []) : []
      const values = Array.isArray(args) ? args : []
      if (name === undefined) continue
      if (name === 'where' || name === 'count') filter(values[0], asked)
      if (name === 'sort' || name === 'newest' || name === 'oldest') asked.sorts.push(...textsOf(values))
      if (name === 'group') {
        asked.groups.push(...textsOf(values[0]))
        asked.worked.push(...workedOf(values[1]))
      }
      if (name === 'pick') asked.picks.push(...textsOf(values[0]))
      if (name === 'near') asked.near = { column: String(values[0]), value: handed(values[1]) }
      if (name === 'add' || name === 'change' || name === 'remove') {
        const written = entries(values[name === 'add' ? 0 : 1])
        asked.write = { kind: name, values: Object.fromEntries(written.map(([key, value]) => [key, handed(value)])) }
      }
      asked.joins.push(name === 'newest' || name === 'oldest' ? 'sort' : name)
    }
  }
}

const seen = new WeakMap<Description, Asked[]>()

/**
 * Takes a description. Answers every read and write of rows that its functions and the rules of its tables hold
 * and that the check can read: the plan of `rows`, the writes of `set`, a rule written as a value, and each
 * chain of a body and of the arrow of a rule that was read. What code makes while it runs is not among them.
 */
export function askedOf(description: Description): Asked[] {
  const held = seen.get(description)
  if (held) return held
  const all: Asked[] = []
  const records = stored(all)
  for (const [definition, fn] of Object.entries(description.functions)) {
    const found: Found = { definition, top: false, system: false, inRule: false, inIn: false }
    if (isStored(fn.plan)) records.plan(fn.plan, { ...found, top: true })
    for (const plan of isStored(fn.rows) ? Object.values(fn.rows) : []) if (isStored(plan)) records.plan(plan, found)
    for (const write of Array.isArray(fn.writes) ? fn.writes : []) {
      if (!isStored(write)) continue
      const kind = (['add', 'change', 'remove'] as const).find((one) => typeof write[one] === 'string')
      if (!kind) continue
      const asked = fresh({ ...found, system: fn.system !== undefined }, String(write[kind]))
      const values = isStored(write.values) ? Object.entries(write.values) : []
      asked.write = { kind, values: Object.fromEntries(values.map(([name, value]) => [name, handedValue(value)])) }
      all.push(asked)
    }
    chains(all, [fn.body, isStored(fn.access) ? fn.access.test : undefined], found)
  }
  for (const [definition, table] of Object.entries(description.tables)) {
    const found: Found = { definition, top: false, system: false, inRule: true, inIn: false }
    for (const rule of isStored(table.access) ? Object.values(table.access) : []) {
      if (!isStored(rule) || rule.rule !== 'where') continue
      if (rule.filter !== undefined) {
        const asked = fresh(found, definition)
        all.push(asked)
        records.filter(rule.filter, asked)
      }
      if (rule.give !== undefined) chains(all, rule.give, found, definition)
    }
  }
  seen.set(description, all)
  return all
}
