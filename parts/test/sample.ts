import { TentError } from '../core/index.ts'
import { isStored } from '../core/internal.ts'

const two = (n: number): string => String(n).padStart(2, '0')

/**
 * Takes a type as the description stores it, the name of its field or column, and with it `n`, the number of the
 * row a value is made for, so that a text of each row is one of its own, and `linked`, which answers the id of a row
 * of a table for a link. Answers a valid value of the type: a text of its own, as long as its least and no longer
 * than its most; a number its least, or 1 where none is stated; `false`; the moment and the day that run; the first
 * of the values of a choice, as `values` of the description keeps them; an empty list, as long as its least of
 * samples of what it holds; and a record of a sample of each field that must be there. It is the one home of a
 * sample, which `app.make`, `tent test --plan` and `tent test --declared` read. Throws T0002 for a kind it cannot fill.
 */
export function sampleOf(
  type: Record<string, unknown>,
  name: string,
  o: { n?: number; linked?: (table: string) => Promise<string> } = {},
): unknown {
  const kind = type.kind
  const min = typeof type.min === 'number' ? type.min : undefined
  const max = typeof type.max === 'number' ? type.max : undefined
  if (kind === 'text') {
    const text = (o.n === undefined ? `A ${name}` : `${name} ${o.n}`).padEnd(min ?? 0, '.')
    return max === undefined ? text : text.slice(0, max)
  }
  if (kind === 'number') return Math.min(min ?? 1, max ?? Number.POSITIVE_INFINITY)
  if (kind === 'boolean') return false
  if (kind === 'date') return new Date()
  if (kind === 'day') {
    const now = new Date()
    return `${now.getUTCFullYear()}-${two(now.getUTCMonth() + 1)}-${two(now.getUTCDate())}`
  }
  if (kind === 'choice') return Array.isArray(type.values) ? type.values[0] : undefined
  if (kind === 'link' && typeof type.table === 'string' && o.linked) return o.linked(type.table)
  if (kind === 'json') return {}
  if (kind === 'list') {
    const of = isStored(type.of) ? type.of : undefined
    return of && min ? Array.from({ length: min }, (_, k) => sampleOf(of, name, { ...o, n: k })) : []
  }
  if (kind === 'vector') return Array.from({ length: typeof type.size === 'number' ? type.size : 0 }, () => 0)
  if (kind === 'object' && isStored(type.shape)) {
    const fields = Object.entries(type.shape).flatMap(([field, one]) =>
      isStored(one) && one.optional !== true ? [[field, sampleOf(one, field, o)] as const] : [],
    )
    // A field that is a link answers a promise of its id: the record answers one where any field does.
    return fields.some(([, value]) => value instanceof Promise)
      ? Promise.all(fields.map(async ([field, value]) => [field, await value] as const)).then(Object.fromEntries)
      : Object.fromEntries(fields)
  }
  throw new TentError('T0002', `No sample is made of \`${name}\`, of the kind ${String(kind)}: give it a value.`, {
    fields: { [name]: 'required' },
  })
}
