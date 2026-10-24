import type { Node } from '../tree.ts'
import { child, keyOf, kid, kids, lineOf, nameOf, propertyOf, unwrap } from '../tree.ts'
import { valueWords } from './access.ts'
import type { Imported, Known, Reach } from './reach.ts'
import { inBlock, NotPlain, Refused } from './reach.ts'
import type { Declared } from './scan.ts'
import { bodyOf, ownNames, statements } from './statement.ts'
import { value } from './value.ts'
import { isStored } from '../../core/internal.ts'

/** What a file gives every arrow that is read in it: its imports, its own definitions and its top-level names. */
export type FileReach = Pick<Reach, 'imports' | 'own' | 'tops'>

/** What made an arrow code: the option it stands in, the thing, and its line. */
export interface Why {
  option: string
  thing: string
  line: number
}

/** What was read of the arrows of one definition. */
export interface ArrowsRead {
  // What was read, by the option: run, onFail, access, access.read.
  bodies: Record<string, object>
  // The first arrow that was not read, with what made it code.
  why?: Why
  // Each arrow that was tried, with its option, and for one that was not read what made it code and where.
  arrows: Map<Node, { option: string; thing?: string; at?: Node }>
  // What is an error in an arrow that was read.
  refused: { code: string; message: string; line: number }[]
}

/** The words of what made an arrow code, as `why` of a definition holds them. */
export const whyText = (why: Why): string => `${why.option}: ${why.thing}, on line ${why.line}`

const reachOf = (file: FileReach, handed: string[], db: string | undefined): Reach => ({
  ...file,
  handed: new Set(handed),
  ...(db !== undefined ? { db } : {}),
  scopes: [],
})

function readRun(arrow: Node, file: FileReach): object[] {
  if (arrow.type !== 'ArrowFunctionExpression') throw new NotPlain('a function other than an arrow', arrow)
  const params = kids(arrow, 'params')
  const names = params.length === 1 ? ownNames(params[0]) : params.length ? undefined : []
  // The one parameter is taken apart into the names it reads. An arrow that names the whole record is code.
  if (!names) throw new NotPlain('an arrow that does not take what it is handed apart by its names', params[0])
  const reach = reachOf(file, names, names.includes('db') ? 'db' : undefined)
  return inBlock(reach, [], () => bodyOf(arrow, reach))
}

/** The kind of each definition in reach, by its name. */
function kindsOf(file: FileReach): Map<string, string> {
  const known: Known[] = [...file.own.values()]
  for (const one of file.imports.values()) if ('app' in one) known.push(one.app)
  return new Map(known.map((one) => [one.definition, one.kind]))
}

// A rule is held to what a query may use: it reads through `db` and calls queries and value words.
function notForARule(stored: unknown, kinds: Map<string, string>): string | undefined {
  if (Array.isArray(stored)) {
    for (const one of stored) {
      const found = notForARule(one, kinds)
      if (found) return found
    }
    return undefined
  }
  if (!isStored(stored)) return undefined
  if (typeof stored.fn === 'string') {
    if (stored.fn === 'random' || stored.fn === 'token') return `\`${stored.fn}()\`, whose value is drawn`
    if (!valueWords.has(stored.fn) && stored.fn !== 'given') return `\`${stored.fn}\``
  }
  if (isStored(stored.call)) {
    const call = stored.call
    const kind = typeof call.function === 'string' && call.member === undefined ? kinds.get(call.function) : undefined
    if (kind !== 'query') return `a call of ${Object.values(call).join('.')}, which is no query`
  }
  if (stored.await !== undefined) return '`await`'
  for (const step of isStored(stored.plan) && Array.isArray(stored.then) ? stored.then : [])
    for (const member of ['add', 'change', 'remove'])
      if (isStored(step) && member in step) return `a write, \`.${member}\``
  for (const one of Object.values(stored)) {
    const found = notForARule(one, kinds)
    if (found) return found
  }
  return undefined
}

function readRule(word: string, arrow: Node, file: FileReach): object {
  if (arrow.type !== 'ArrowFunctionExpression') throw new NotPlain('a function other than an arrow', arrow)
  const names = kids(arrow, 'params').map((param) => {
    const name = nameOf(param)
    if (name === undefined) throw new NotPlain('an arrow that takes apart what it is handed', param)
    return name
  })
  const reach = reachOf(file, names, names[word === 'allow' ? 2 : 1])
  const body = child(arrow, 'body')
  if (arrow.async === true) throw new NotPlain('a rule whose arrow is `async`', arrow)
  if (body.type === 'BlockStatement') {
    // The statements are read for the first thing that no body holds, which says more than that they are statements.
    inBlock(reach, [], () => statements(kids(body, 'body'), reach))
    throw new NotPlain('a rule whose arrow is more than one value', body)
  }
  const one = inBlock(reach, [], () => value(body, reach))
  const wrong = notForARule(one, kindsOf(file))
  if (wrong)
    throw new Refused(
      'T1014',
      `a rule may read through \`db\` and call queries and value words, and this one holds ${wrong}.`,
      arrow,
    )
  return word === 'allow' ? { as: names, test: one } : { as: names, give: one }
}

/** The rule arrows among the options of a definition, each by the option it stands in: access, access.read, follow. */
function rulesOf(
  options: Node | undefined,
  file: FileReach,
  path: string[] = [],
): { option: string; word: string; arrow: Node }[] {
  const found: { option: string; word: string; arrow: Node }[] = []
  for (const property of options?.type === 'ObjectExpression' ? kids(options, 'properties') : []) {
    const key = property.type === 'Property' ? keyOf(property) : undefined
    const written = kid(property, 'value')
    if (key === undefined || !written) continue
    const inner = unwrap(written)
    const imported: Imported | undefined =
      inner.type === 'CallExpression' ? file.imports.get(nameOf(child(inner, 'callee')) ?? '') : undefined
    const word = imported && 'ours' in imported ? imported.ours : undefined
    const [first, second] = kids(inner, 'arguments')
    const handed = first ? unwrap(first) : undefined
    const isArrow = handed?.type === 'ArrowFunctionExpression' || handed?.type === 'FunctionExpression'
    if ((word === 'allow' || word === 'where') && handed && isArrow && !second)
      found.push({ option: [...path, key].join('.'), word, arrow: handed })
    else if (inner.type === 'ObjectExpression' && !path.length && key === 'access')
      found.push(...rulesOf(inner, file, [key]))
  }
  return found
}

/**
 * Takes a definition as its file writes it, what the file gives its arrows, and the text of the file. Answers
 * what was read of its `run`, its `onFail` and the arrows of its rules, each in its stored form, and for each
 * that was not read what made it code.
 */
export function readArrows(declared: Declared, file: FileReach, text: string): ArrowsRead {
  const read: ArrowsRead = { bodies: {}, arrows: new Map(), refused: [] }
  const tried = (option: string, arrow: Node, work: () => object) => {
    read.arrows.set(arrow, { option })
    try {
      read.bodies[option] = work()
    } catch (failure) {
      if (failure instanceof NotPlain) {
        read.arrows.set(arrow, { option, thing: failure.thing, at: { type: '', start: failure.at, end: failure.at } })
        read.why ??= { option, thing: failure.thing, line: lineOf(text, failure.at) }
      } else if (failure instanceof Refused)
        read.refused.push({ code: failure.code, message: failure.message, line: lineOf(text, failure.at) })
      else throw failure
    }
  }
  for (const option of ['run', 'onFail']) {
    const written = kid(propertyOf(declared.options, option), 'value')
    if (written && ['query', 'change', 'action', 'flow'].includes(declared.word)) {
      const arrow = unwrap(written)
      tried(option, arrow, () => readRun(arrow, file))
    }
  }
  for (const rule of rulesOf(declared.options, file))
    tried(rule.option, rule.arrow, () => readRule(rule.word, rule.arrow, file))
  return read
}

/**
 * Takes what `seed` is handed, as the file of the starter data writes it. Answers the stored body of an arrow
 * that holds only our words. Throws `NotPlain` for any other arrow.
 */
export function readSeed(arrow: Node, file: FileReach): object[] {
  return readRun(arrow, file)
}
