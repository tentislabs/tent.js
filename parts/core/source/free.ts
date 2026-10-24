import { isStored } from '../record.ts'

/**
 * Takes what was read of an arrow: the statements of a body, or one value. Answers each first name it
 * reads that nothing inside it gave - no `const`, no repeat, no arrow and no `then` - in the order
 * first read: the names that its one parameter is taken apart into.
 */
export function freeNames(stored: unknown): string[] {
  const found: string[] = []
  const see = (name: unknown, bound: ReadonlySet<string>): void => {
    if (typeof name === 'string' && !bound.has(name) && !found.includes(name)) found.push(name)
  }
  const walk = (value: unknown, bound: ReadonlySet<string>): void => {
    if (Array.isArray(value)) {
      // A `const` gives its name to the statements after it, to the end of its block.
      let inner = bound
      for (const one of value) {
        walk(one, inner)
        if (isStored(one) && 'const' in one && 'value' in one)
          inner = new Set([...inner, ...(Array.isArray(one.const) ? one.const.map(String) : [String(one.const)])])
      }
      return
    }
    if (!isStored(value)) return
    const v = value
    if (Array.isArray(v.name)) {
      see(v.name[0], bound)
      walk(v.name.slice(1), bound)
      return
    }
    // What a file names is stored with its value, which reads nothing.
    if (isStored(v.named)) return
    if (isStored(v.plan)) {
      if (typeof v.plan.db === 'string') see('db', bound)
      else walk(v.plan, bound)
      walk(v.then, bound)
      return
    }
    if (typeof v.fn === 'string' && v.fn.split('.')[0] === 'step') see('step', bound)
    if (isStored(v.call) && v.system === true) see('call', bound)
    if (Array.isArray(v.arrow)) {
      walk(v.do, new Set([...bound, ...v.arrow.map(String)]))
      return
    }
    if (typeof v.for === 'string' && 'of' in v) {
      walk(v.of, bound)
      walk(v.do, new Set([...bound, v.for]))
      return
    }
    for (const [key, one] of Object.entries(v)) if (key !== 'const') walk(one, bound)
  }
  walk(stored, new Set())
  return found
}
