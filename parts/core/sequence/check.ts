import type { Description } from '../description.ts'
import type { Finding } from '../errors.ts'
import { finding } from '../finding.ts'
import { isStored } from '../record.ts'
import type { ToolSpec } from '../shared.ts'
import type { Type } from '../type.ts'
import type { RunTool } from './tools.ts'
import { runTools, twoLinesOf, typedAnswers } from './tools.ts'

/** The type of a value as the check follows it, and the tool whose answer it comes from. */
interface Typed {
  type?: Type
  from?: string
}

/** What the check of one sequence holds while it goes through it. */
interface Checking {
  description: Description
  agent: string
  tools: Map<string, RunTool>
  o: { specs?: ToolSpec[]; held?: string[] }
  typed: boolean
  found: Finding[]
  line: number
}

type Names = Map<string, Typed>

const listOf = (node: unknown): unknown[] => (Array.isArray(node) ? node : [])
const number: Type = { kind: 'number' }
const textType: Type = { kind: 'text' }
const yesNo: Type = { kind: 'boolean' }

/** Adds a finding of T7121 at the line where the check stands, with the two lines of the tool it is about. */
function found(c: Checking, what: string, tool?: string): void {
  const lines = tool ? twoLinesOf(c.description, c.agent, tool, c.o) : ''
  c.found.push(finding('T7121', `${what}, on line ${c.line}.${lines ? `\n${lines}` : ''}`))
}

/** The type of a read into a value by a path: a field of a record, `length`, and a place of a list. */
function readType(c: Checking, from: Typed, path: unknown[]): Typed {
  let type = from.type
  for (const raw of path) {
    if (!type) return {}
    if (raw === '?') continue
    const entry = typeof raw === 'string' && raw.startsWith('?') ? raw.slice(1) : raw
    if ((type.kind === 'list' || type.kind === 'text') && entry === 'length') type = number
    else if (type.kind === 'list' && typeof entry !== 'string') type = type.of
    else if (type.kind === 'object' && typeof entry === 'string') {
      if (!Object.hasOwn(type.shape, entry)) {
        const whose = from.from ? `the answer of ${from.from}` : 'the record'
        found(c, `a read of the field \`${entry}\`, which ${whose} does not have`, from.from)
        return {}
      }
      type = type.shape[entry]
    } else return {}
  }
  return { ...(type ? { type } : {}), ...(from.from ? { from: from.from } : {}) }
}

/** What a written value is, where it is a value written in place: a text, a number or a truth. */
function writtenKind(node: unknown): string | undefined {
  if (typeof node === 'string' || (isStored(node) && 'text' in node)) return 'text'
  if (typeof node === 'number') return 'number'
  return typeof node === 'boolean' ? 'boolean' : undefined
}

const takesText = new Set(['text', 'choice', 'link', 'file', 'date', 'day'])

/** Checks one written field of the input of a call against the type of that field. */
function fieldChecked(c: Checking, told: string, field: string, type: Type, value: unknown): void {
  const kind = writtenKind(value)
  if (!kind) return
  const fits =
    kind === 'text' ? takesText.has(type.kind) || type.kind === 'json' : type.kind === kind || type.kind === 'json'
  if (!fits) found(c, `the field \`${field}\` of ${told} takes a ${type.kind}, and is handed a ${kind}`, told)
  else if (type.kind === 'choice' && typeof value === 'string' && !type.values.includes(value))
    found(
      c,
      `the field \`${field}\` of ${told} takes one of ${type.values.map((one) => `'${one}'`).join(', ')}, and is handed '${value}'`,
      told,
    )
}

/** Checks a call of a tool: its name, and the fields of an input that is written in place. Answers what it gives. */
function callChecked(c: Checking, told: string, args: unknown[], names: Names): Typed {
  const input = args[0]
  typeOf(c, input, names)
  const tool = c.tools.get(told)
  if (!tool) {
    if (!c.o.held?.includes(told)) found(c, `\`${told}\` is no tool of this agent`)
    return {}
  }
  if (isStored(input) && Array.isArray(input.object)) {
    const written = new Map(input.object.map((entry) => [String(listOf(entry)[0]), listOf(entry)[1]]))
    for (const [field, type] of Object.entries(tool.input))
      if (!written.has(field) && type.optional !== true && Reflect.get(type, 'default') === undefined)
        found(c, `the call of ${told} lacks the field \`${field}\`, which it needs`, told)
    for (const [field, value] of written) {
      const type = Object.hasOwn(tool.input, field) ? tool.input[field] : undefined
      if (!type) found(c, `the call of ${told} hands the field \`${field}\`, which it does not take`, told)
      else fieldChecked(c, told, field, type, value)
    }
  }
  return { ...(tool.given ? { type: tool.given } : {}), from: told }
}

/** Checks the body of an arrow handed to `each` or `all`, with its first name holding an entry of the list. */
function arrowChecked(c: Checking, arrow: unknown, list: Typed, names: Names): void {
  if (!isStored(arrow)) return
  const inside: Names = new Map(names)
  const [first] = listOf(arrow.arrow)
  const entry = list.type?.kind === 'list' ? list.type.of : undefined
  if (typeof first === 'string')
    inside.set(first, { ...(entry ? { type: entry } : {}), ...(list.from ? { from: list.from } : {}) })
  statementsChecked(c, listOf(arrow.do), inside)
}

// The words whose type is known whatever they are handed. Of every word that is in none of these it is not known.
const textWords = new Set(['concat', 'lower', 'upper', 'trim', 'join', 'fingerprint'])
const numberWords = new Set(['sum', 'round', 'floor', 'ceil', 'between'])
const yesNoWords = new Set(['startsWith', 'contains', 'sameSecret'])

/** Checks a call of a word, and answers the type of what it gives where it is known. */
function wordChecked(c: Checking, node: Record<string, unknown>, names: Names): Typed {
  const name = String(node.fn)
  const args = listOf(node.args)
  if (name === 'fill') {
    if (!c.typed) found(c, "`fill`, which this agent's model cannot answer: it lacks the ability typedAnswers")
    const [shape] = args
    typeOf(c, args[1], names)
    const type: unknown = isStored(shape) ? shape.type : undefined
    return isStored(type) && typeof type.kind === 'string' ? { type: Object(type) } : {}
  }
  if (name === 'each' || name === 'all') {
    const list = typeOf(c, args[0], names)
    arrowChecked(c, args[1], list, names)
    return {}
  }
  const typed = args.map((one) => typeOf(c, one, names))
  if (name === 'where' || name === 'slice') return typed[0] ?? {}
  if (name === 'range') return { type: { kind: 'list', of: number } }
  // The sign of a `calc` says what it answers: a number, but of `+`, which may join texts, or true or false.
  if (name === 'calc') {
    const sign = String(args[0])
    if (['-', '*', '/', '%'].includes(sign)) return { type: number }
    return ['==', '!=', '<', '<=', '>', '>='].includes(sign) ? { type: yesNo } : {}
  }
  if (textWords.has(name)) return { type: textType }
  if (numberWords.has(name)) return { type: number }
  return yesNoWords.has(name) ? { type: yesNo } : {}
}

/** Checks one stored value of a sequence, and answers its type where it is known. */
function typeOf(c: Checking, node: unknown, names: Names): Typed {
  if (Array.isArray(node)) {
    for (const one of node) typeOf(c, one, names)
    return {}
  }
  if (typeof node === 'string') return { type: textType }
  if (typeof node === 'number') return { type: number }
  if (typeof node === 'boolean') return { type: yesNo }
  if (!isStored(node)) return {}
  if ('await' in node) return typeOf(c, node.await, names)
  if ('name' in node) {
    const [first, ...path] = listOf(node.name)
    for (const one of path) if (isStored(one)) typeOf(c, one, names)
    return readType(c, names.get(String(first)) ?? {}, path)
  }
  if ('read' in node) return readType(c, typeOf(c, node.read, names), listOf(node.path))
  if ('call' in node && isStored(node.call)) return callChecked(c, String(node.call.tool), listOf(node.args), names)
  if ('fn' in node) return wordChecked(c, node, names)
  if ('object' in node) {
    const shape: Record<string, Type> = {}
    for (const entry of listOf(node.object)) {
      const [key, value] = listOf(entry)
      shape[String(key)] = typeOf(c, value, names).type ?? { kind: 'json' }
    }
    return { type: { kind: 'object', shape } }
  }
  for (const value of Object.values(node)) typeOf(c, value, names)
  if ('text' in node) return { type: textType }
  if ('minus' in node) return { type: number }
  return 'not' in node ? { type: yesNo } : {}
}

/** Checks a list of stored statements, in a block of names of its own. */
function statementsChecked(c: Checking, list: unknown[], around: Names): void {
  const names: Names = new Map(around)
  for (const statement of list) {
    if (!isStored(statement)) continue
    const before = c.line
    if (typeof statement.line === 'number') c.line = statement.line
    if ('const' in statement) {
      const made = typeOf(c, statement.value, names)
      if (typeof statement.const === 'string') names.set(statement.const, made)
      else for (const one of listOf(statement.const)) names.set(String(one), readType(c, made, [String(one)]))
    } else if ('for' in statement) {
      const list = typeOf(c, statement.of, names)
      arrowChecked(c, { arrow: [statement.for], do: statement.do }, list, names)
    } else if ('if' in statement) {
      typeOf(c, statement.if, names)
      statementsChecked(c, listOf(statement.then), names)
      statementsChecked(c, listOf(statement.else), names)
    } else typeOf(c, 'return' in statement ? statement.return : statement.do, names)
    if (typeof statement.line !== 'number') c.line = before
  }
}

/**
 * Takes a description, an agent, the stored form of a sequence, and the tools that the run's sources gave it
 * and the outside tools that are held back. Answers what is sure to fail, each T7121 with its line and, for what
 * concerns a tool, the two lines of that tool: a name that is no tool, a read of a field that a record's type does
 * not have, a call whose written input lacks a required field or names one the tool does not take, a written value
 * of another kind than its field, a text that is no value of a `choice`, and `fill` where the model has no
 * `typedAnswers`. Where a type is not known, a `json`, or a choice of two, nothing is said.
 */
export function checkSequence(
  description: Description,
  agent: string,
  body: object[],
  o: { specs?: ToolSpec[]; held?: string[] } = {},
): Finding[] {
  const c: Checking = {
    description,
    agent,
    tools: runTools(description, agent, o),
    o,
    typed: typedAnswers(description, agent),
    found: [],
    line: 1,
  }
  statementsChecked(c, body, new Map())
  return c.found
}
