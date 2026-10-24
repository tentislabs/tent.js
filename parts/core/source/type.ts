import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import type { Doc } from './doc.ts'
import { called, listDoc, recordDoc } from './doc.ts'
import { exprDoc } from './expr.ts'
import { marked } from './marked.ts'
import { measuredDoc } from './plain.ts'
import { filterDoc } from './plan.ts'
import { arrowDoc } from './statements.ts'
import { keyText, quoted } from './texts.ts'
import type { Writing } from './writing.ts'
import { naming, noText, ours } from './writing.ts'

// The options of a type in the order they are written: those of its kind, those of every type, those of a column.
// How a column is kept stands where its `from` stands, since it is written as that `from`.
const order = [
  'min',
  'max',
  'pattern',
  'lines',
  'secret',
  'whole',
  'messages',
  'onRemove',
  'maxSize',
  'kinds',
  'size',
  'model',
  'copy',
  'optional',
  'default',
  'label',
  'help',
  'unique',
  'index',
  'private',
  'personal',
  'sealed',
  'read',
  'from',
  'keeps',
  'by',
  'old',
  'was',
]

/** One old name as text, and several as a list. */
export const wasDoc = (was: unknown): Doc => {
  const names = (Array.isArray(was) ? was : [was]).map((one) => quoted(String(one)))
  return names.length === 1 ? names[0] : listDoc(names)
}

/** Text that a form shows: text, or a message of the language files. */
const shownDoc = (w: Writing, shown: unknown): Doc =>
  isStored(shown) && typeof shown.message === 'string'
    ? called(ours(w, 'message'), [quoted(shown.message)])
    : exprDoc(w, shown)

/** The work that fills a column, as it is written: the work alone, or a record with what it states beside. */
function byDoc(w: Writing, by: Stored): Doc {
  const { work, columns, debounce, ...more } = by
  const entries: Doc[] = []
  if (typeof work === 'string') entries.push(`work: ${naming(w, work)}`)
  if (Array.isArray(columns)) entries.push(['columns: ', exprDoc(w, columns)])
  for (const [name, value] of Object.entries(more)) entries.push([`${name}: `, exprDoc(w, value)])
  if (debounce !== undefined)
    entries.push(['debounce: ', measuredDoc(w, marked('tables', '*', 'columns', '*', 'by', 'debounce'), debounce)])
  if (entries.length === 1 && typeof work === 'string') return naming(w, work)
  return entries.length === 1 && Array.isArray(columns) ? exprDoc(w, columns) : recordDoc(entries)
}

/** How a column is kept, as the word of its `from`: `count`, `sum`, `min` or `max`, with the rows that it reads. */
function keptDoc(w: Writing, keeps: Stored): Doc {
  const word = ours(w, String(keeps.do))
  const entries: Doc[] = [`of: ${quoted(String(keeps.of))}`, `by: ${quoted(String(keeps.by))}`]
  if (typeof keeps.column === 'string') entries.push(`column: ${quoted(keeps.column)}`)
  if (keeps.where !== undefined) entries.push(['where: ', filterDoc(w, keeps.where)])
  return called(word, [recordDoc(entries)])
}

/**
 * A stored type without what the keeping of its column stored beside it, which its `from` gives again: the whole
 * number and the 0 of a count, the 0 of a sum, and the optional of a least and of a most.
 */
function unkept(type: Stored): Stored {
  if (!isStored(type.keeps)) return type
  const kept = type.keeps.do
  const { whole, default: start, optional, ...rest } = type
  return {
    ...rest,
    ...(kept === 'count' ? {} : { whole }),
    ...(kept === 'count' || kept === 'sum' ? {} : { default: start }),
    ...(kept === 'min' || kept === 'max' ? {} : { optional }),
  }
}

/** One option of a type as it is written. A sealed column that is found states so inside `sealed`. */
function optionDoc(w: Writing, type: Stored, name: string, value: unknown): Doc {
  if (name === 'default' && isStored(value)) {
    if (value.now === true && type.kind === 'date') return quoted('now')
    if (value.today === true) return quoted('today')
  }
  if (name === 'maxSize') return measuredDoc(w, marked('tables', '*', 'columns', '*', 'maxSize'), value)
  if (name === 'sealed' && type.findable === true) return recordDoc(['findable: true'])
  if (name === 'read') return ruleDoc(w, value)
  if (name === 'keeps' && isStored(value)) return keptDoc(w, value)
  if (name === 'label' || name === 'help') return shownDoc(w, value)
  if (name === 'model') return naming(w, String(value))
  if (name === 'was') return wasDoc(value)
  if (name === 'by' && isStored(value)) return byDoc(w, value)
  return exprDoc(w, value)
}

/** Takes a stored type. Answers it as its call, with the options that it holds: what equals its default is not stored. */
export function typeDoc(w: Writing, type: unknown): Doc {
  if (!isStored(type)) return called(ours(w, 'json'), [])
  const kind = String(type.kind)
  const word = ours(w, kind)
  const first: Doc[] = []
  if (kind === 'choice') first.push(exprDoc(w, type.values))
  if (kind === 'link') first.push(quoted(String(type.table)))
  if (kind === 'list') first.push(typeDoc(w, type.of))
  if (kind === 'object') first.push(typesDoc(w, type.shape))
  const stated = unkept(type)
  const options = order
    .filter((name) => stated[name] !== undefined)
    .map((name): Doc => [`${name === 'keeps' ? 'from' : name}: `, optionDoc(w, stated, name, stated[name])])
  return called(word, options.length ? [...first, recordDoc(options)] : first)
}

/** A record of types by their names, as an input and the columns of a table are: one to a line where `broken` says so. */
export const typesDoc = (w: Writing, types: unknown, broken = false): Doc =>
  recordDoc(
    Object.entries(isStored(types) ? types : {}).map(([name, type]) => [`${keyText(name)}: `, typeDoc(w, type)]),
    broken,
  )

/**
 * Takes a stored rule. Answers it as its word: a text, `role`, `anyone`, a `where` over a filter, or the arrow that
 * was read. Throws T0013 for a rule that is code.
 */
export function ruleDoc(w: Writing, rule: unknown): Doc {
  if (!isStored(rule)) return quoted('nobody')
  if (rule.rule === 'role') return called(ours(w, 'role'), [quoted(String(rule.role))])
  if (rule.rule === 'anyone')
    return rule.why === '' ? quoted('anyone') : called(ours(w, 'anyone'), [quoted(String(rule.why))])
  if (rule.rule === 'where' && rule.filter !== undefined) return called(ours(w, 'where'), [filterDoc(w, rule.filter)])
  if ((rule.rule === 'where' || rule.rule === 'allow') && Array.isArray(rule.as)) {
    const word = ours(w, rule.rule)
    const names = rule.as.map(String)
    const before = w.db
    // The `db` of a rule is the last name its arrow was handed, under whatever name the author gave it.
    w.db = names[rule.rule === 'allow' ? 2 : 1] ?? 'db'
    const value = rule.rule === 'allow' ? rule.test : rule.give
    const arrow = arrowDoc(w, { arrow: names, do: [{ return: value }] })
    w.db = before
    return called(word, [arrow])
  }
  if (rule.rule === 'where' || rule.rule === 'allow') throw noText(`A rule that is written with \`${rule.rule}\``)
  return quoted(String(rule.rule))
}
