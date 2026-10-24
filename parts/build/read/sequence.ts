import { parse, unreadOf } from '../borrowed/vite.ts'
import type { Node } from '../tree.ts'
import { child, kids, lineOf, unwrap } from '../tree.ts'
import type { Imported, Reach } from './reach.ts'
import { inBlock, NotPlain, Refused } from './reach.ts'
import { bodyOf } from './statement.ts'
import { valueWords } from './access.ts'
import { isStored } from '../../core/internal.ts'

// The value words a sequence may hold: those that work only on what they are handed. `now`, `random` and
// `token` are left out, since a sequence is carried out again from its top after a restart.
const sequenceValueWords = [...valueWords].filter((name) => !['now', 'random', 'token'].includes(name))
const sequenceTypes = ['text', 'number', 'boolean', 'date', 'day', 'choice', 'list', 'object']

// What stands around the text, so that it is read as the body of an arrow: line 1 is the first line of `run`.
const before = '(async () => {\n'
const after = '\n})'

/** The names a sequence holds: the words, the engine's own, and each tool by the name it is told under. */
function namesOf(o: { tools: string[]; fill: boolean }): Map<string, Imported> {
  const names = new Map<string, Imported>()
  for (const word of [...sequenceValueWords, ...sequenceTypes, 'fail']) names.set(word, { ours: word })
  names.set('call', { sequence: 'call' })
  names.set('all', { sequence: 'all' })
  if (o.fill) names.set('fill', { sequence: 'fill' })
  for (const tool of o.tools) {
    const [first, ...rest] = tool.split('.')
    names.set(first, { sequence: rest.length ? 'dotted' : 'tool' })
  }
  return names
}

/** Whether a stored form is one that answers and waits in a sequence: a call of a tool, a `fill`, an `all`. */
const waitsOn = (node: Record<string, unknown>): boolean =>
  (isStored(node.call) && 'tool' in node.call) || node.fn === 'fill' || node.fn === 'all'

/** Whether a stored form holds a call that waits, at any depth, inside arrows too. */
function holdsCall(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(holdsCall)
  if (!isStored(node)) return false
  return waitsOn(node) || Object.values(node).some(holdsCall)
}

/**
 * Takes a stored form. Answers it with each call of a tool, `fill`, `all` and `each` whose arrow holds one stored
 * as awaited, whether the text wrote `await` or not, and each arrow that holds one marked as an arrow that waits.
 */
function awaited(node: unknown, inAwait = false): unknown {
  if (Array.isArray(node)) return node.map((one) => awaited(one))
  if (!isStored(node)) return node
  if ('await' in node) return { ...node, await: awaited(node.await, true) }
  const made: Record<string, unknown> = Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, awaited(value)]),
  )
  if ('arrow' in made && holdsCall(made.do)) made.waits = true
  const waits = waitsOn(made) || (made.fn === 'each' && holdsCall(made.args))
  return waits && !inAwait ? { await: made } : made
}

/** What the reader says of a method, with how a sequence writes what a method would do, so that a model mends it at once. */
const mended = (thing: string): string =>
  thing.includes('a method')
    ? `${thing}: a sequence holds no method of a value; make a list with each(list, (x) => ...), and keep rows with where(rows, { field: value })`
    : thing

/** The arrow that stands around the text, where the text stays inside it. */
function arrowOf(tree: Node): Node | undefined {
  const [statement, ...more] = kids(tree, 'body')
  if (!statement || more.length || statement.type !== 'ExpressionStatement') return undefined
  const arrow = unwrap(child(statement, 'expression'))
  if (arrow.type !== 'ArrowFunctionExpression') return undefined
  return child(arrow, 'body').start === before.length - 2 ? arrow : undefined
}

/**
 * Takes the text of a sequence, the names its tools are told under, and whether `fill` is a name of it. Answers
 * the stored form of the body, read by the rules of a `run` as the body of an arrow, with each statement keeping
 * its line, counted from the first line of the text; or the first thing in it that a sequence may not hold, and
 * its line.
 */
export function readBody(
  text: string,
  o: { tools: string[]; fill: boolean },
): { body: object[] } | { why: string; line: number } {
  const wrapped = `${before}${text}${after}`
  // A place in what stands around the text is told as the nearest line of the text.
  const last = text.split('\n').length
  const lineAt = (at: number): number => Math.min(last, Math.max(1, lineOf(wrapped, at) - 1))
  let tree: Node
  try {
    tree = parse(wrapped, false)
  } catch (thrown) {
    const unread = unreadOf(thrown)
    return { why: `text that is no code: ${unread.words}`, line: unread.at === undefined ? 1 : lineAt(unread.at) }
  }
  const arrow = arrowOf(tree)
  if (!arrow) return { why: 'a text that ends the sequence before its end', line: 1 }
  const reach: Reach = {
    imports: namesOf(o),
    own: new Map(),
    tops: new Map(),
    handed: new Set(),
    scopes: [],
    tools: new Set(o.tools),
    lineOf: lineAt,
  }
  try {
    const body = inBlock(reach, [], () => bodyOf(arrow, reach))
    const made = awaited(body)
    return { body: Array.isArray(made) ? made : [] }
  } catch (failure) {
    if (failure instanceof NotPlain) return { why: mended(failure.thing), line: lineAt(failure.at) }
    if (failure instanceof Refused) return { why: failure.message, line: lineAt(failure.at) }
    throw failure
  }
}
