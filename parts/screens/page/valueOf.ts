// How the page code works out the stored values of a view. It is apart from `valueOf` of core, which carries out
// every value word and handle, because every page loads this file: a value word is loaded with the part `values`.
import { isStored } from '../../core/internal.ts'
import { partHeld } from './parts.ts'
import { zoneNow } from './viewZone.ts'

/** What a stored value of a view is worked out with: the names it reads, and what the page knows beside them. */
export interface Names {
  // The names that the view was handed, and those of the arrows around the value.
  names: Record<string, unknown>
  // The address of an asset, by its name, or nothing for a name that no asset has.
  asset?(name: string): string | undefined
}

/** Reads one member of a value, as a stored form reads it: a member of its own, and the length of a list and of a text. */
function memberOf(from: unknown, key: unknown): unknown {
  if (from === null || from === undefined)
    throw new TypeError(`Cannot read properties of ${from === null ? 'null' : 'undefined'} (reading '${String(key)}')`)
  if (typeof from === 'string') return key === 'length' ? from.length : typeof key === 'number' ? from[key] : undefined
  if (typeof from !== 'object') return undefined
  const name = typeof key === 'number' ? String(key) : key
  // A member that a thing only inherits from the runtime is not there for a stored form.
  return typeof name === 'string' && Object.hasOwn(from, name) ? Reflect.get(from, name) : undefined
}

/** Follows a path into a value: each entry is a name, a whole number, or a place that is worked out. */
function follow(start: unknown, path: unknown[], o: Names): unknown {
  let at = start
  for (let k = 0; k < path.length; k++) {
    let entry = path[k]
    let optional = false
    if (entry === '?') {
      // The entry "?" alone says that the place after it was reached with `?.`.
      optional = true
      k += 1
      entry = path[k]
    } else if (typeof entry === 'string' && entry.startsWith('?')) {
      optional = true
      entry = entry.slice(1)
    }
    // Where `?.` meets nothing, the whole read ends with nothing, as it does in code.
    if (optional && (at === null || at === undefined)) return undefined
    at = memberOf(at, isStored(entry) ? valueOf(entry, o) : entry)
  }
  return at
}

/** Whether two values are equal as `==` holds them: nothing equals nothing, and two kinds are brought to one. */
function loose(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined)
    return (a === null || a === undefined) && (b === null || b === undefined)
  if (typeof a === typeof b) return a === b
  if (typeof a === 'object') return loose(String(a), b)
  if (typeof b === 'object') return loose(a, String(b))
  if (typeof a === 'boolean') return loose(Number(a), b)
  if (typeof b === 'boolean') return loose(a, Number(b))
  return Number(a) === Number(b)
}

// Each sign as JavaScript works it out for whatever it is handed: the types say numbers, and the values decide.
const signs: Record<string, (a: never, b: never) => unknown> = {
  '+': (a: number, b: number) => a + b,
  '-': (a: number, b: number) => a - b,
  '*': (a: number, b: number) => a * b,
  '/': (a: number, b: number) => a / b,
  '%': (a: number, b: number) => a % b,
  '<': (a: number, b: number) => a < b,
  '<=': (a: number, b: number) => a <= b,
  '>': (a: number, b: number) => a > b,
  '>=': (a: number, b: number) => a >= b,
  '==': (a: unknown, b: unknown) => loose(a, b),
  '!=': (a: unknown, b: unknown) => !loose(a, b),
  '===': (a: unknown, b: unknown) => a === b,
  '!==': (a: unknown, b: unknown) => a !== b,
}

const minus = (a: number) => -a

function signed(sign: unknown, node: Record<string, unknown>, o: Names): unknown {
  const left = valueOf(node.left, o)
  // The three signs that may leave their right side alone.
  if (sign === '&&') return left && valueOf(node.right, o)
  if (sign === '||') return left || valueOf(node.right, o)
  if (sign === '??') return left ?? valueOf(node.right, o)
  if (typeof sign !== 'string' || !Object.hasOwn(signs, sign))
    throw new Error(`A value holds a sign that it cannot carry out: ${String(sign)}`)
  return Reflect.apply(signs[sign], undefined, [left, valueOf(node.right, o)])
}

/**
 * Takes one stored value of a view, and what it is worked out with. Answers the value: every form means what the
 * same text means as code, and a read into what is not there fails as it does in code.
 */
export function valueOf(stored: unknown, o: Names): unknown {
  if (Array.isArray(stored)) return stored.map((one) => valueOf(one, o))
  if (!isStored(stored)) return stored
  if ('name' in stored && Array.isArray(stored.name)) {
    const [first, ...path] = stored.name
    return follow(o.names[String(first)], path, o)
  }
  if ('read' in stored) return follow(valueOf(stored.read, o), Array.isArray(stored.path) ? stored.path : [], o)
  if ('text' in stored && Array.isArray(stored.text)) return stored.text.map((one) => `${valueOf(one, o)}`).join('')
  if ('object' in stored && Array.isArray(stored.object))
    return Object.fromEntries(stored.object.map((entry) => [String(Object(entry)[0]), valueOf(Object(entry)[1], o)]))
  if ('op' in stored) return signed(stored.op, stored, o)
  if ('not' in stored) return !valueOf(stored.not, o)
  if ('minus' in stored) return Reflect.apply(minus, undefined, [valueOf(stored.minus, o)])
  if ('nothing' in stored) return undefined
  if ('if' in stored) return valueOf(valueOf(stored.if, o) ? stored.then : stored.else, o)
  if ('named' in stored) return valueOf(stored.value, o)
  // A value word is worked out by its part of the page code, which a page loads with a screen that holds one.
  if ('fn' in stored && typeof stored.fn === 'string') {
    const part = partHeld('values')
    if (!part)
      throw new Error(`The value word ${stored.fn} is worked out by a part of the page code that is not loaded.`)
    return part.called(stored, o.names, zoneNow())
  }
  // A message stays a message, with its key and its values worked out: the tag that shows it draws it in its language.
  if ('message' in stored) {
    const key = typeof stored.message === 'string' ? stored.message : valueOf(stored.message, o)
    const values = isStored(stored.with)
      ? Object.fromEntries(Object.entries(stored.with).map(([name, one]) => [name, valueOf(one, o)]))
      : undefined
    return values === undefined ? { message: key } : { message: key, with: values }
  }
  if ('asset' in stored) {
    const name = valueOf(stored.asset, o)
    return typeof name === 'string' ? o.asset?.(name) : undefined
  }
  throw new Error(`A value holds a form that it cannot carry out: ${Object.keys(stored).join(', ')}`)
}
