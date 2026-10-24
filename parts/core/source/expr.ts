import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import type { Doc } from './doc.ts'
import { called, firstSign, listDoc, recordDoc } from './doc.ts'
import { planDoc } from './plan.ts'
import { arrowDoc, isArrow } from './statements.ts'
import { inBackticks, isName, keyText, quoted } from './texts.ts'
import { typeDoc } from './type.ts'
import type { Writing } from './writing.ts'
import { naming, ours, top } from './writing.ts'

// How strongly each sign binds, as JavaScript reads it: a larger number binds more strongly.
const strength: Record<string, number> = {
  '??': 3,
  '||': 3,
  '&&': 4,
  '==': 8,
  '!=': 8,
  '===': 8,
  '!==': 8,
  '<': 9,
  '<=': 9,
  '>': 9,
  '>=': 9,
  '+': 11,
  '-': 11,
  '*': 12,
  '/': 12,
  '%': 12,
}
const choice = 2
const front = 14
const whole = 17

/** A piece in round brackets where it binds more weakly than its place asks. */
const within = (doc: Doc, own: number, asked: number): Doc => (own < asked ? ['(', doc, ')'] : doc)

/** One entry of a name after its first, as it is written: a dot, a place in square brackets, each with `?.` where it was read so. */
function entries(w: Writing, path: unknown[]): Doc[] {
  const made: Doc[] = []
  let asked = false
  for (const entry of path) {
    const dot = asked ? '?.' : ''
    if (entry === '?') {
      asked = true
      continue
    }
    asked = false
    if (typeof entry === 'number') made.push(`${dot}[${entry}]`)
    else if (typeof entry !== 'string') {
      // A place by a text that starts with a question mark, or by an empty one, is a written text all the same.
      const texts = isStored(entry) && Array.isArray(entry.text) ? entry.text : undefined
      const one = texts?.length === 1 && typeof texts[0] === 'string' ? texts[0] : undefined
      const text = one !== undefined && (one === '' || one.startsWith('?')) ? quoted(one) : exprDoc(w, entry)
      made.push([`${dot}[`, text, ']'])
    } else if (dot === '' && entry.startsWith('?') && entry.length > 1) {
      const name = entry.slice(1)
      made.push(isName(name) ? `?.${name}` : `?.[${quoted(name)}]`)
    } else made.push(isName(entry) ? `${dot === '' ? '.' : dot}${entry}` : `${dot}[${quoted(entry)}]`)
  }
  return made
}

/** A text with values inside it, in backticks. A written text that is empty or follows another is written as a value. */
function textDoc(w: Writing, parts: unknown[]): Doc {
  const made: Doc[] = ['`']
  let wasText = false
  for (const part of parts) {
    if (typeof part === 'string' && part !== '' && !wasText) made.push(inBackticks(part))
    else made.push(['${', exprDoc(w, part), '}'])
    wasText = typeof part === 'string'
  }
  // One empty text alone is a text in backticks that holds nothing.
  if (parts.length === 1 && parts[0] === '') return '``'
  return [...made, '`']
}

/** The entries of an object the author wrote, in their stored order. */
function objectDoc(w: Writing, list: unknown[]): Doc {
  return recordDoc(
    list.map((entry) => {
      const [key, value] = Array.isArray(entry) ? entry : [undefined, undefined]
      return [`${keyText(String(key))}: `, exprDoc(w, value)]
    }),
  )
}

/** The values that a word or a call is handed: each a value, an arrow, or a list of arrows. */
const argDocs = (w: Writing, args: unknown): Doc[] =>
  (Array.isArray(args) ? args : []).map((one) =>
    isArrow(one)
      ? arrowDoc(w, one)
      : Array.isArray(one) && one.some(isArrow)
        ? listDoc(one.map((entry) => (isArrow(entry) ? arrowDoc(w, entry) : exprDoc(w, entry))))
        : exprDoc(w, one),
  )

/** What a stored call calls: a definition or a member of it, a call of a service or of a model, or a member of a handle. */
function calledDoc(w: Writing, call: Stored): string {
  if (typeof call.builtin === 'string') {
    const [handle, ...rest] = call.builtin.split('.')
    return [ours(w, handle), ...rest].join('.')
  }
  const name = naming(w, String(call.function ?? call.flow ?? call.agent ?? call.service ?? call.model))
  const member = call.call ?? call.member
  return typeof member === 'string' ? `${name}.${member}` : name
}

/** A value that the file names, written back as its name: a top-level name, the name of a text file, or an option of the project. */
function namedDoc(w: Writing, name: Stored, value: unknown): string {
  if (typeof name.top === 'string') return top(w, name.top, value)
  if (typeof name.textFile === 'string') {
    const as = String(name.as)
    w.textFiles.set(as, name.textFile)
    return as
  }
  const path = Array.isArray(name.project) ? name.project : []
  return [naming(w, w.project), ...path].join('.')
}

/** Whether a read into a value needs no brackets around it: the value starts with one whole thing that a dot may follow. */
const startsWhole = (base: unknown): boolean =>
  isStored(base) &&
  ['fn', 'call', 'plan', 'named', 'setting', 'concat', 'calc', 'now', 'random'].some((key) => key in base)

/**
 * Takes a stored value of a body, of a view or of a form written with values, and how strongly its place binds.
 * Answers its text, in round brackets wherever the text would otherwise read to another tree.
 */
export function exprDoc(w: Writing, value: unknown, asked = 0): Doc {
  if (value === null) return 'null'
  if (typeof value === 'string') return quoted(value)
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return listDoc(value.map((one) => exprDoc(w, one)))
  if (!isStored(value)) return 'undefined'
  const v = value
  if (Array.isArray(v.name)) return [String(v.name[0]), ...entries(w, v.name.slice(1))]
  if ('read' in v && Array.isArray(v.path)) {
    const base = exprDoc(w, v.read)
    return [startsWhole(v.read) ? base : ['(', base, ')'], ...entries(w, v.path)]
  }
  if (Array.isArray(v.text)) return textDoc(w, v.text)
  if (Array.isArray(v.object)) return objectDoc(w, v.object)
  if (typeof v.op === 'string') {
    const own = strength[v.op] ?? 0
    // `??` stands beside `&&` and `||` only with brackets between them.
    const mixed = (side: unknown): boolean =>
      isStored(side) &&
      typeof side.op === 'string' &&
      (v.op === '??' ? side.op === '&&' || side.op === '||' : (v.op === '&&' || v.op === '||') && side.op === '??')
    const left = exprDoc(w, v.left, mixed(v.left) ? whole + 1 : own)
    const right = exprDoc(w, v.right, mixed(v.right) ? whole + 1 : own + 1)
    return within([left, ` ${v.op} `, right], own, asked)
  }
  if ('not' in v && Object.keys(v).length === 1) return within(['!', exprDoc(w, v.not, front)], front, asked)
  if ('minus' in v) {
    const inner = exprDoc(w, v.minus, front)
    // Two hyphens in a row would read as one sign of their own.
    return within(['-', firstSign(inner) === '-' ? ['(', inner, ')'] : inner], front, asked)
  }
  if (v.nothing === true) return 'undefined'
  if ('if' in v)
    return within(
      [exprDoc(w, v.if, choice + 1), ' ? ', exprDoc(w, v.then, choice), ' : ', exprDoc(w, v.else, choice)],
      choice,
      asked,
    )
  if ('await' in v) return within(['await ', exprDoc(w, v.await, front)], front, asked)
  if (typeof v.fn === 'string') {
    const [first, ...rest] = v.fn.split('.')
    if (first !== 'step') ours(w, first)
    return called([first, ...rest].join('.'), argDocs(w, v.args))
  }
  if (Array.isArray(v.concat))
    return called(
      ours(w, 'concat'),
      v.concat.map((one) => exprDoc(w, one)),
    )
  if (typeof v.calc === 'string')
    return called(ours(w, 'calc'), [quoted(v.calc), exprDoc(w, v.left), exprDoc(w, v.right)])
  for (const word of ['now', 'random']) if (v[word] === true) return called(ours(w, word), [])
  for (const word of ['input', 'caller', 'col', 'secret'])
    if (typeof v[word] === 'string') return called(ours(w, word), [quoted(v[word])])
  if (typeof v.setting === 'string') return `${ours(w, 'settings')}${isName(v.setting) ? '.' : ''}${keyed(v.setting)}`
  if (isStored(v.call)) {
    const args = argDocs(w, v.args)
    return v.system === true
      ? called('call', [naming(w, String(v.call.function)), ...args])
      : called(calledDoc(w, v.call), args)
  }
  if (isStored(v.plan)) {
    const plan = v.plan
    const start = Array.isArray(plan.name)
      ? exprDoc(w, { name: plan.name })
      : typeof plan.table === 'string'
        ? naming(w, plan.table)
        : `${w.db}${plan.system === true ? '.system' : ''}.${plan.db}`
    const then = (Array.isArray(v.then) ? v.then : []).flatMap((step) =>
      Object.entries(isStored(step) ? step : {}).map(([member, args]) => called(`.${member}`, argDocs(w, args))),
    )
    return [start, ...then]
  }
  if (isStored(v.named)) return namedDoc(w, v.named, v.value)
  if (isStored(v.type)) return typeDoc(w, v.type)
  if (isStored(v.types))
    return recordDoc(Object.entries(v.types).map(([name, type]) => [`${keyText(name)}: `, typeDoc(w, type)]))
  if (typeof v.from === 'string') return planDoc(w, v)
  for (const kind of ['function', 'flow', 'agent', 'screen', 'service', 'model', 'table']) {
    const name = v[kind]
    if (typeof name === 'string')
      return typeof v.member === 'string' ? `${naming(w, name)}.${v.member}` : naming(w, name)
  }
  // A record of no known form is written as the record it is, so that nothing of it is lost.
  return recordDoc(Object.entries(v).map(([key, one]) => [`${keyText(key)}: `, exprDoc(w, one)]))
}

/** A setting by its name after `settings`: a dot and the name, or the name in square brackets. */
const keyed = (name: string): string => (isName(name) ? name : `[${quoted(name)}]`)
