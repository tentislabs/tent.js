/** One change between two points, in the terms of the app: what was added, removed, renamed or changed. */
export interface Change {
  change: 'added' | 'removed' | 'renamed' | 'changed'
  what: string
  name: string
  was?: string
  path?: (string | number)[]
  from?: unknown
  to?: unknown
  lines?: number
}

/** A value as a line shows it: as JSON, so that text stands in quotes, and a choice and a type bare. */
function shown(value: unknown, bare: boolean): string {
  if (value === undefined) return 'nothing'
  return bare && typeof value === 'string' ? value : JSON.stringify(value)
}

/** A type on one line, as the line of an added column shows it: its kind, and that it is optional. */
function typeShown(type: unknown): string {
  const kind = typeof type === 'object' && type !== null ? Reflect.get(type, 'kind') : undefined
  const optional = typeof type === 'object' && type !== null && Reflect.get(type, 'optional') === true
  return typeof kind === 'string' ? ` (${kind}${optional ? ', optional' : ''})` : ''
}

/** What changed inside a thing, by its path: the path with dots between, and the two values. */
function changed(change: Change, bare: boolean): string {
  const path = (change.path ?? []).join('.')
  if (!('from' in change) && !('to' in change)) return `${path} changed`
  return `${path} changed ${shown(change.from, bare)} -> ${shown(change.to, bare)}`
}

/**
 * Takes one change. Answers the line that `tent history compare` prints for it: the kind and the name of the
 * definition it belongs to, and what happened to it.
 */
export function lineOf(change: Change): string {
  const { what, name } = change
  const [owner, ...rest] = name.split('.')
  const inner = rest.join('.')
  if (what === 'column') {
    const line = `table ${owner}: column`
    if (change.change === 'added') return `${line} "${inner}" added${typeShown(change.to)}`
    if (change.change === 'removed') return `${line} "${inner}" removed`
    if (change.change === 'renamed')
      return `${line} "${(change.was ?? '').split('.').slice(1).join('.')}" renamed to "${inner}"`
    return `${line} "${inner}": ${changed(change, (change.path ?? []).at(-1) === 'kind')}`
  }
  if (what === 'step') return `flow ${owner}: step "${inner}" ${change.change}`
  if (change.change === 'renamed') return `${what} ${name}: renamed from ${change.was}`
  if (change.change !== 'changed') return `${what} ${name}: ${change.change}`
  if (what === 'file') return `file ${name}: changed`
  if (change.lines !== undefined && change.path === undefined)
    return `${what} ${name}: code changed (${change.lines} ${change.lines === 1 ? 'line' : 'lines'})`
  return `${what} ${name}: ${changed(change, false)}`
}
