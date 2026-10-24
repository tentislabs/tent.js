import type { Keeps } from '../counted.ts'
import { keptIn } from '../counted.ts'
import { isMarked } from '../mark.ts'
import { planOf } from '../planOf.ts'
import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import { isZone } from '../time.ts'
import { asValue } from '../written.ts'
import type { Told } from './shared.ts'
import { bytes, insideOf, known, ms, plainOf, report, setField, wasOf } from './shared.ts'
import { shownAs } from './shown.ts'

const every = ['kind', 'optional', 'default', 'label', 'help']
/** The options that a type takes where it is a column. */
export const ofColumn = [
  'unique',
  'index',
  'private',
  'personal',
  'sealed',
  'from',
  'was',
  'by',
  'old',
  'keeps',
  'read',
]
const own: Record<string, string[]> = {
  text: ['min', 'max', 'pattern', 'lines', 'secret'],
  number: ['min', 'max', 'whole'],
  boolean: [],
  date: [],
  day: [],
  json: [],
  choice: ['values', 'messages'],
  link: ['table', 'onRemove'],
  file: ['maxSize', 'kinds'],
  list: ['of', 'min', 'max'],
  object: ['shape'],
  vector: ['size', 'model', 'copy'],
}

/** The words that a `from` may not hold: what is drawn, and what is no value of the row. */
const notInFrom = ['now', 'random', 'input', 'caller', 'setting']

/** Reports what a stored value holds that its place does not take: T1014. `where` says the place. */
export function heldValue(told: Told, where: string, value: unknown, refuse: readonly string[], plans = false): void {
  if (Array.isArray(value)) {
    for (const one of value) heldValue(told, where, one, refuse, plans)
    return
  }
  if (typeof value === 'function')
    report(
      told,
      'T1014',
      `${where} holds a function where a value stands.`,
      'Write a value, or a word of ours that works one out.',
    )
  if (!isStored(value)) return
  if (typeof value.from === 'string' && !plans)
    report(
      told,
      'T1014',
      `${where} holds a plan where a value stands.`,
      'A plan may stand in `in` of a filter of a plan, and nowhere else in a value.',
    )
  const fn = typeof value.fn === 'string' ? value.fn : undefined
  for (const word of refuse)
    if (word in value || fn === word)
      report(
        told,
        'T1014',
        `${where} holds \`${fn ?? word}\`, which may not stand there.`,
        'Take it out, or work the value out in a change.',
      )
  for (const one of insideOf(value)) heldValue(told, where, one, refuse, plans)
}

/** The stored form of a `default`: a literal, the moment or the day it is made, or the caller. */
function defaultOf(kind: unknown, written: unknown): unknown {
  if (kind === 'date' && written === 'now') return { now: true }
  if (kind === 'day' && written === 'today') return { today: true }
  return asValue(written)
}

/** Whether a stored value is a literal: no reference and no word of ours inside it, as a record written whole holds none. */
function isLiteral(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(isLiteral)
  if (!isStored(value)) return typeof value !== 'function'
  const entries = Array.isArray(value.object) ? value.object : undefined
  return (
    Object.keys(value).length === 1 &&
    entries !== undefined &&
    entries.every((one) => Array.isArray(one) && isLiteral(one[1]))
  )
}

/** Whether a stored `default` is one a default may be: a literal, the moment or the day it is made, or the caller. */
const isDefault = (stored: unknown): boolean =>
  isLiteral(stored) ||
  (isStored(stored) &&
    Object.keys(stored).length === 1 &&
    (stored.now === true || stored.today === true || stored.caller === 'id'))

const shownOf = (written: unknown): unknown => (isStored(written) ? plainOf(written) : written)

/**
 * Takes a type as a type word answered it, and whether it stands as a column. Answers the type as it is stored: a
 * size in bytes, `'now'` and `'today'` as their records, `was` as a list, and a member that equals its default
 * left out. Reports T1003 for an option the type does not take where it stands, and T1014 for a value of an option
 * that is not allowed.
 */
export function typeOf(told: Told, where: string, written: unknown, column = false): Stored {
  if (!isStored(written) || typeof written.kind !== 'string' || !Object.hasOwn(own, written.kind)) {
    report(told, 'T1014', `${where} is no type.`, 'Write a type word, as text() or number().')
    return { kind: 'json' }
  }
  const kind = written.kind
  const vector = kind === 'vector'
  // A vector takes no default, and as a column it is never unique, indexed, sealed or worked out. `old` is for a
  // vector, and for a column that states `by`.
  // How a column is kept is written with `from`, and is stored apart from it.
  const taken = [...every, ...own[kind], ...(column ? ofColumn : [])].filter((option) =>
    vector
      ? !['default', 'unique', 'index', 'sealed', 'from', 'keeps', ...(column ? [] : ['copy'])].includes(option)
      : option !== 'keeps' && (option !== 'old' || written.by !== undefined),
  )
  known(told, `${where}, a \`${kind}\`,`, written, taken)
  const type: Stored = { kind }
  const bad = (option: string, why: string) =>
    report(told, 'T1014', `${where}: \`${option}\` ${why}.`, `Give \`${option}\` a value that is allowed.`)
  for (const option of ['min', 'max']) {
    if (written[option] !== undefined && typeof written[option] !== 'number') bad(option, 'is no number')
    setField(type, option, written[option])
  }
  if (typeof written.min === 'number' && typeof written.max === 'number' && written.min > written.max)
    bad('min', 'is over `max`')
  if (written.pattern !== undefined) {
    try {
      new RegExp(String(written.pattern), 'u')
    } catch {
      bad('pattern', 'is no regular expression')
    }
    setField(type, 'pattern', written.pattern)
  }
  setField(type, 'lines', written.lines, 'one')
  for (const flag of ['secret', 'whole', 'optional', 'unique', 'index', 'private', 'personal', 'sealed'])
    if (taken.includes(flag)) setField(type, flag, written[flag], false)
  // A sealed value that is found is stored as a sealed one, with `findable` beside it.
  if (taken.includes('sealed') && isStored(written.sealed)) {
    if (written.sealed.findable !== true) bad('sealed', 'is neither true nor a record that states findable')
    type.sealed = true
    type.findable = true
  }
  if (kind === 'choice') {
    if (
      !Array.isArray(written.values) ||
      !written.values.length ||
      written.values.some((one) => typeof one !== 'string')
    )
      bad('values', 'is no list of texts with one value at least')
    setField(type, 'values', Array.isArray(written.values) ? [...written.values] : undefined)
    setField(type, 'messages', written.messages)
  }
  if (kind === 'link') {
    if (typeof written.table !== 'string' || !written.table) bad('table', 'is no name of a table')
    setField(type, 'table', written.table)
    setField(type, 'onRemove', written.onRemove, 'refuse')
  }
  if (kind === 'file') {
    setField(type, 'maxSize', bytes(told, `${where}.maxSize`, written.maxSize))
    setField(type, 'kinds', written.kinds)
  }
  if (kind === 'list') type.of = typeOf(told, `${where}.of`, written.of)
  if (kind === 'object')
    type.shape = Object.fromEntries(
      Object.entries(isStored(written.shape) ? written.shape : {}).map(([name, one]) => [
        name,
        typeOf(told, `${where}.${name}`, one),
      ]),
    )
  if (vector) {
    if (!Number.isInteger(written.size) || Number(written.size) < 1) bad('size', 'is no whole number from 1 up')
    setField(type, 'size', written.size)
    setField(type, 'model', written.model)
    if (written.copy !== undefined && written.copy !== 'small') bad('copy', "is no copy but 'small'")
    if (column) setField(type, 'copy', written.copy)
    const model = typeof written.model === 'string' ? told.all.get(written.model) : undefined
    const abilities = model?.options.abilities
    if (
      typeof written.model === 'string' &&
      (model?.kind !== 'model' || (Array.isArray(abilities) && !abilities.includes('embed')))
    )
      bad('model', 'names no model that has the ability `embed`')
    // A vector column is always optional, so the word changes nothing there.
    if (column) delete type.optional
  }
  if (taken.includes('old')) setField(type, 'old', written.old)
  if (taken.includes('default') && written.default !== undefined) {
    type.default = defaultOf(kind, written.default)
    if (!isDefault(type.default)) bad('default', "is no literal, 'now', 'today' or `caller('id')`")
  }
  for (const option of ['label', 'help']) {
    const shown = written[option]
    const keyed = isStored(shown) && typeof shown.message === 'string' && Object.keys(plainOf(shown) ?? {}).length === 1
    if (shown !== undefined && typeof shown !== 'string' && !keyed)
      bad(option, 'is neither text nor a message of the language files by its key alone')
    else setField(type, option, shownOf(shown))
  }
  if (column) {
    setField(type, 'was', wasOf(written.was))
    const keeps = keptIn(written.from)
    if (keeps) keptOf(told, where, type, keeps)
    else if (written.from !== undefined) {
      type.from = asValue(written.from)
      heldValue(told, `${where}.from`, type.from, [...notInFrom, 'token', 'each'])
    }
    if (written.by !== undefined) type.by = byOf(told, where, written.by, vector && written.model !== undefined)
  }
  return type
}

/** The kind of the column of another table that a kept least or a most reads, where its table is known. */
function readKind(told: Told, keeps: Keeps): unknown {
  const columns = told.all.get(keeps.of)?.options.columns
  return keeps.column === undefined
    ? undefined
    : Reflect.get(Object(Reflect.get(Object(columns), keeps.column)), 'kind')
}

/**
 * Stores how a column that a `from` keeps is kept: a count as a whole number from 0, a sum from 0, and a least and
 * a most as optional, since they hold nothing while no row is counted. Reports T1014 for a count or a sum in a
 * column that is no number, and for a least or a most in a column of another kind than the column it reads.
 */
function keptOf(told: Told, where: string, type: Stored, keeps: Keeps): void {
  const reads = keeps.do === 'count' || keeps.do === 'sum' ? 'number' : readKind(told, keeps)
  if (typeof reads === 'string' && type.kind !== reads)
    report(
      told,
      'T1014',
      `${where}: a kept \`${keeps.do}\` of \`${keeps.of}\` is a \`${reads}\`, and the column is a \`${String(type.kind)}\`.`,
      `Write ${reads}({ from: ${keeps.do}({ ... }) }).`,
    )
  if (keeps.do === 'count') type.whole = true
  if (keeps.do === 'count' || keeps.do === 'sum') type.default = 0
  else type.optional = true
  type.keeps = plainOf(keeps)
}

/**
 * The stored form of `by` of a column: the work that fills it, or for a vector with a model the columns its words
 * come from. `columns` on any other column is stored as it is written, for the check to name (T2015).
 */
function byOf(told: Told, where: string, written: unknown, embeds: boolean): Stored {
  const by: Stored = {}
  const o = isStored(written) && !('definition' in written) ? written : {}
  if (embeds || (o.work === undefined && o.columns !== undefined)) {
    const columns = typeof written === 'string' ? [written] : Array.isArray(written) ? written : o.columns
    setField(by, 'columns', typeof columns === 'string' ? [columns] : columns)
    if (embeds) setField(by, 'batch', o.batch, 32)
  } else {
    const work = o.work ?? written
    const name = typeof work === 'string' ? work : Reflect.get(Object(work), 'definition')
    if (typeof name !== 'string')
      report(told, 'T1014', `${where}: \`by\` names no work.`, 'Name an action, a python or a model.')
    setField(by, 'work', name)
    setField(by, 'input', o.input)
    setField(by, 'take', o.take)
  }
  setField(by, 'debounce', ms(told, `${where}.by.debounce`, o.debounce), 5000)
  setField(by, 'tries', o.tries, 3)
  setField(by, 'order', o.order, 'missing')
  setField(by, 'version', o.version)
  setField(by, 'limits', plainOf(o.limits))
  return by
}

/** The stored form of a record of types by name, as an input and the columns of a table are. */
export function typesOf(
  told: Told,
  where: string,
  written: unknown,
  column = false,
): Record<string, Stored> | undefined {
  if (written === undefined) return undefined
  if (!isStored(written)) {
    report(told, 'T1014', `${where} is no record of types.`, 'Write a record from a name to a type.')
    return undefined
  }
  return Object.fromEntries(
    Object.entries(written).map(([name, one]) => [name, typeOf(told, `${where}.${name}`, one, column)]),
  )
}

/**
 * Takes a rule as it was written, the option it stands in, and the name its code is exported under. Answers the
 * rule as it is stored: a word as its record, a rule written as a value as it is, and a rule that is an arrow as
 * what the build read of it, or as its export where it is code.
 */
export function ruleOf(told: Told, option: string, written: unknown, exported: string): Stored | undefined {
  if (written === undefined) return undefined
  if (typeof written === 'string') {
    if (['nobody', 'signedIn', 'owner'].includes(written)) return { rule: written }
    if (written === 'anyone') return { rule: 'anyone', why: '' }
  }
  if (isMarked(written) && typeof written.rule === 'string') {
    if (written.rule === 'role' || written.rule === 'anyone') return { ...written }
    const read = told.loaded.bodies?.[option]
    if (written.filter !== undefined) {
      heldValue(told, `the rule \`${option}\``, written.filter, ['given', 'random', 'token'], true)
      return { rule: 'where', filter: written.filter }
    }
    if (isStored(read)) return { rule: written.rule, ...read }
    return { rule: written.rule, export: exported }
  }
  report(
    told,
    'T1014',
    `\`${option}\` is no rule.`,
    "Write 'nobody', 'signedIn', 'owner', role(...), anyone(...), where(...) or allow(...).",
  )
  return undefined
}

/** Reports a zone that the runtime does not know: T1014. */
export function zoneOf(told: Told, option: string, written: unknown): unknown {
  if (written !== undefined && !isZone(written))
    report(
      told,
      'T1014',
      `\`${option}\` names no time zone that the runtime knows: ${shownAs(written)}.`,
      "Write the name of a zone, as 'Europe/Istanbul'.",
    )
  return written
}

/** The stored record of a plan that a table made, or nothing with T1014 for any other value. */
export function planRecord(told: Told, option: string, written: unknown): Stored | undefined {
  if (written === undefined) return undefined
  const record = planOf(written)
  if (!record) {
    report(told, 'T1014', `\`${option}\` is no plan.`, 'Write a plan that starts at a table, as orders.where({ ... }).')
    return undefined
  }
  heldValue(told, `\`${option}\``, record, [], true)
  const stored: Stored = { ...record }
  return stored
}
