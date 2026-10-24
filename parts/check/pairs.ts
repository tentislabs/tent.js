import type { Description } from '../core/internal.ts'
import { inside } from './rule.ts'
import { isStored } from '../core/internal.ts'

/** What the check can see of a value in a plain definition, as far as it matters to a sign of JavaScript. */
type Kind = 'date' | 'list' | 'record' | { row: string } | undefined

/** Two values that a sign of JavaScript stands between, with the sign, or a text that holds a moment. */
export interface Pair {
  sign: string
  kinds: 'dates' | 'lists' | 'text'
}

const ofType = (type: unknown): Kind => {
  if (!isStored(type)) return undefined
  if (type.kind === 'date') return 'date'
  if (type.kind === 'list' || type.kind === 'vector') return 'list'
  return type.kind === 'object' ? 'record' : undefined
}

/** The type of a field of a record of types, read into by names. */
function field(types: unknown, path: unknown[]): Kind {
  let at: unknown = { kind: 'object', shape: types }
  for (const name of path) {
    const shape = isStored(at) && isStored(at.shape) ? at.shape : undefined
    at = shape && typeof name === 'string' ? shape[name.replace(/^\?/, '')] : undefined
  }
  return ofType(at)
}

/**
 * Takes a description and the name of a plain definition of it. Answers each place in what it stores where a
 * sign of JavaScript stands between two moments, or between two lists or records, as far as the check can see
 * what the two values are, and each text with values that holds a moment.
 */
export function pairsOf(description: Description, name: string): Pair[] {
  const stored = description.functions[name] ?? description.flows[name]
  if (!stored) return []
  const names = new Map<string, Kind>()
  const column = (table: string, path: unknown[]): Kind => {
    if (!path.length) return { row: table }
    const [first, ...rest] = path
    const columns = description.tables[table]?.columns
    const type = isStored(columns) && typeof first === 'string' ? columns[first.replace(/^\?/, '')] : undefined
    if (first === 'createdAt' || first === 'updatedAt') return 'date'
    return rest.length ? undefined : ofType(type)
  }
  const into = (kind: Kind, path: unknown[]): Kind => {
    if (!path.length) return kind
    if (isStored(kind)) return column(kind.row, path)
    return undefined
  }
  const kindOf = (value: unknown): Kind => {
    if (Array.isArray(value)) return 'list'
    if (!isStored(value)) return undefined
    if (Array.isArray(value.object)) return 'record'
    if (value.named !== undefined) return kindOf(value.value)
    if (value.now === true || value.fn === 'now') return 'date'
    if (typeof value.input === 'string') return field(stored.input, [value.input])
    if (value.await !== undefined) return kindOf(value.await)
    if (Array.isArray(value.path)) return into(kindOf(value.read), value.path)
    if (Array.isArray(value.name)) {
      const [first, ...rest] = value.name
      if (first === 'input') return field(stored.input, rest)
      if (first === 'now') return rest.length ? undefined : 'date'
      return typeof first === 'string' ? into(names.get(first), rest) : undefined
    }
    if (typeof value.fn === 'string' && Array.isArray(value.args)) {
      if (value.fn === 'later' || value.fn === 'earlier') return kindOf(value.args[0]) === 'date' ? 'date' : undefined
      if (value.fn === 'where') return kindOf(value.args[0])
      return value.fn === 'each' || value.fn === 'range' ? 'list' : undefined
    }
    const table = isStored(value.plan) && typeof value.plan.db === 'string' ? value.plan.db : undefined
    const last = Array.isArray(value.then) ? value.then.at(-1) : undefined
    if (table === undefined || !isStored(last)) return undefined
    if ('get' in last || 'first' in last) return { row: table }
    return 'all' in last ? 'list' : undefined
  }
  const found: Pair[] = []
  const pair = (sign: unknown, left: unknown, right: unknown): void => {
    const [a, b] = [kindOf(left), kindOf(right)]
    if (typeof sign !== 'string' || a === undefined || b === undefined) return
    const compares = ['==', '!=', '===', '!=='].includes(sign)
    if (a === 'date' && b === 'date' && (compares || sign === '-')) found.push({ sign, kinds: 'dates' })
    else if (a !== 'date' && b !== 'date' && compares) found.push({ sign, kinds: 'lists' })
  }
  const rules = [stored.access, stored.plan, stored.writes]
  // A name of a body is known from its line on: the statements are walked in their order.
  inside([rules, stored.body, stored.onFail], (record) => {
    if (typeof record.const === 'string') names.set(record.const, kindOf(record.value))
    if (record.op !== undefined) pair(record.op, record.left, record.right)
    if (record.calc !== undefined) pair(record.calc, record.left, record.right)
    if (record.fn === 'calc' && Array.isArray(record.args)) pair(record.args[0], record.args[1], record.args[2])
    if (Array.isArray(record.text) && record.text.some((one) => kindOf(one) === 'date'))
      found.push({ sign: 'text', kinds: 'text' })
  })
  return found
}
