import { isMarked } from '../mark.ts'
import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import { asValue, asValues } from '../written.ts'
import { keepAt } from './kept.ts'
import { nameIf } from './named.ts'
import type { Told } from './shared.ts'
import { known, ms, optionsOf, report, setField } from './shared.ts'
import { typeOf } from './type.ts'

/** The names every view is handed, none of which a name of `data`, of `state` or of `props` may be. */
const handed = [
  'params',
  'state',
  'user',
  'language',
  'settings',
  'calls',
  'set',
  'above',
  'screen',
  'error',
  'grant',
  'ask',
  'children',
]

/** Reports each name of a record of a view that is one of the names every view is handed: T1009. */
export function namesFree(told: Told, option: string, names: readonly string[]): void {
  for (const name of names)
    if (handed.includes(name))
      report(
        told,
        'T1009',
        `the name \`${name}\` of \`${option}\` is reserved: every view is handed a value under it.`,
        'Give it another name.',
      )
}

/** The most characters a number is counted as in the cookie of the device states. */
const numberBytes = 24

/** The bytes of a value as JSON writes it. */
export const jsonBytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length

/**
 * Takes a stored type. Answers the most bytes a value of it takes in the JSON text of the cookie of the device
 * states, or nothing for a type that the cookie does not take: a `boolean` as `false`, a `number` as 24
 * characters, a `choice` as its longest entry, and a `text` as `max` characters of four bytes each.
 */
export function cookieBytes(type: Stored): number | undefined {
  if (type.kind === 'boolean') return jsonBytes(false)
  if (type.kind === 'number') return numberBytes
  if (type.kind === 'choice' && Array.isArray(type.values)) return Math.max(0, ...type.values.map(jsonBytes))
  if (type.kind === 'text' && typeof type.max === 'number' && type.max <= 100) return type.max * 4 + jsonBytes('')
  return undefined
}

/** Whether a state of a stored type starts as something: a `boolean` starts false, and any other type as its default or, where it is optional, as nothing. */
const startsAs = (type: Stored): boolean =>
  type.kind === 'boolean' || type.default !== undefined || type.optional === true

/** Why a state kept `in: 'device'` is refused where the cookie does not take its type, and its fix. */
export const notForDevice = [
  "is kept `in: 'device'` and is no `boolean`, `choice`, `number` or `text` with a `max` of 100 or less",
  "Keep it `in: 'browser'`, or give it a smaller type.",
] as const

/**
 * Takes the place of a state and its type as it was written. Answers the type as it is stored, and reports one that
 * starts as nothing it could be (T1014): no `boolean`, no `default`, and not `optional`. What is no type was told
 * already, and is stored as a type that stands in for it.
 */
export function stateType(told: Told, where: string, written: unknown): Stored {
  const type = typeOf(told, where, written)
  if (isStored(written) && written.kind === type.kind && !startsAs(type))
    report(
      told,
      'T1014',
      `\`${where}\` is no \`boolean\`, states no \`default\` and is not \`optional\`.`,
      'Give its type a `default`, or mark it `optional: true`, so that it starts as nothing.',
    )
  return type
}

/** Whether a stored type, or a type inside it, is one that an address cannot hold. */
function leavesAddress(type: Stored): boolean {
  if (['json', 'file', 'vector'].includes(String(type.kind))) return true
  const inner = [type.of, ...Object.values(optionsOf(type.shape))]
  return inner.some((one) => isStored(one) && leavesAddress(one))
}

/**
 * Takes the state of a screen or of a component as it was written. Answers it as it is stored: for each name its
 * type, or its type with where it is kept. Reports a reserved name (T1009), and what a state may not state
 * (T1014): an `in` that is none of the three, a device state in a component or of a type that the cookie does not
 * take, a type that an address cannot hold, and `back` on a state that is not kept in the address.
 */
export function viewState(told: Told, kind: 'screen' | 'component', written: unknown): Stored {
  const stored: Stored = {}
  namesFree(told, 'state', Object.keys(optionsOf(written)))
  for (const [name, one] of Object.entries(optionsOf(written))) {
    const entry = optionsOf(one)
    const where = `state.${name}`
    const bad = (why: string, fix: string) => report(told, 'T1014', `\`${where}\` ${why}.`, fix)
    if (typeof entry.kind === 'string') {
      keepAt(stored, name, stateType(told, where, one))
      continue
    }
    known(told, where, entry, ['type', 'in', 'back', 'reset'])
    const type = stateType(told, where, entry.type)
    if (entry.in !== undefined && !['address', 'device', 'browser'].includes(String(entry.in)))
      bad(
        "states an `in` that is none of `'address'`, `'device'` and `'browser'`",
        'Write one of the three, or leave it out.',
      )
    else if (entry.in === 'device' && kind === 'component')
      bad("is kept `in: 'device'`, which a component declares none of", 'Declare it on the screen, or in `project`.')
    else if (entry.in === 'device' && cookieBytes(type) === undefined) bad(...notForDevice)
    else if (entry.in === 'address' && leavesAddress(type))
      bad(
        "is kept `in: 'address'` and holds a `json`, a `file` or a `vector`, which an address cannot hold",
        "Keep it `in: 'browser'`, or leave `in` out.",
      )
    if (entry.back === true && entry.in !== 'address')
      bad(
        'states `back`, which is for a state that is kept in the address',
        "Take `back` out, or keep it `in: 'address'`.",
      )
    const kept: Stored = { type }
    setField(kept, 'in', entry.in)
    setField(kept, 'back', entry.back, false)
    setField(kept, 'reset', entry.reset)
    keepAt(stored, name, kept)
  }
  return stored
}

/** What an entry of `data` reads, by the kind of the definition that its name stands for. */
function kindOfRead(told: Told, name: string): 'query' | 'action' {
  return told.all.get(name)?.kind === 'action' ? 'action' : 'query'
}

/**
 * Takes one entry of `data` as `read` answered it, or as the build read it. Answers it as it is stored: what it
 * reads under `query` or `action`, its input, and `needed`, `wait` and `refresh` where they differ from what holds
 * when they are left out. Nothing, with T1014, for what is no `read`.
 */
function entryOf(told: Told, where: string, written: unknown, wasRead: boolean): Stored | undefined {
  const entry = optionsOf(written)
  const name = nameIf(told, where, entry.read)
  if (!isStored(written) || name === undefined) {
    if (entry.read === undefined)
      report(told, 'T1014', `\`${where}\` is no \`read(...)\`.`, 'Write the entry as read(query, input).')
    return undefined
  }
  const stored: Stored = { [kindOfRead(told, name)]: name }
  // What the build read is stored already, and what `read` was handed is a record of written values.
  if (isStored(entry.input)) setField(stored, 'input', wasRead ? { ...entry.input } : asValues(entry.input))
  setField(stored, 'needed', entry.needed, false)
  if (entry.wait === false) stored.wait = false
  setField(stored, 'refresh', ms(told, `${where}.refresh`, entry.refresh))
  return stored
}

/**
 * Takes `data` as it was written, and what the build read of it where it is an arrow. Answers it as it is stored:
 * its entries by their names, or `{ code: true }` for an arrow that is not plain. Reports a reserved name (T1009)
 * and an entry that is no `read` (T1014).
 */
export function viewData(told: Told, written: unknown, read: unknown): Stored | undefined {
  if (written === undefined) return undefined
  const entries = isStored(read) ? read : typeof written === 'function' ? undefined : optionsOf(written)
  if (!entries) return { code: true }
  if (typeof written !== 'function' && !isStored(written)) {
    report(told, 'T1014', '`data` is neither a record of `read(...)` nor an arrow.', 'Write a record of read(...).')
    return undefined
  }
  namesFree(told, 'data', Object.keys(entries))
  const stored: Stored = {}
  for (const [name, one] of Object.entries(entries)) {
    const entry = entryOf(told, `data.${name}`, one, isStored(read))
    if (entry) keepAt(stored, name, entry)
  }
  return stored
}

/**
 * Takes a value of a screen that is text, a word of a language file, or an arrow, and what the build read of the
 * arrow. Answers it as it is stored: the value as a stored value, the record of the word, what was read, or
 * `{ code: true }` for an arrow that is not plain.
 */
export function viewValue(written: unknown, read: unknown): unknown {
  if (typeof written === 'function') return read === undefined ? { code: true } : read
  return isMarked(written) ? { ...written } : asValue(written)
}

/** Whether a stored value of a screen is an arrow that was kept as code. */
export const isCode = (stored: unknown): boolean => isStored(stored) && stored.code === true

/**
 * Takes the components the definition names in its options. Answers the components its view draws, in the order of
 * their names: those the build saw in its code and those of the options, and the parts of the page code that the
 * build saw its file needs, and what its hooks need of the headers of the page.
 */
export function viewOf(told: Told, named: readonly (string | undefined)[]): Stored {
  const views = optionsOf(told.loaded.views)
  const stored: Stored = {}
  const seen = Array.isArray(views.uses) ? views.uses.filter((one) => typeof one === 'string') : []
  setField(stored, 'uses', [...new Set([...seen, ...named.filter((one) => one !== undefined)])].sort())
  const needed = Array.isArray(views.needs) ? views.needs.filter((one) => typeof one === 'string') : []
  setField(stored, 'needs', [...new Set(needed)].sort())
  if (isStored(views.opens) && views.opens.microphone === true) stored.opens = { microphone: true }
  return stored
}
