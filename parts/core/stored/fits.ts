import { arrowsIn } from '../arrows.ts'
import { checkInto } from '../checked.ts'
import { checkValue } from '../checkValue.ts'
import type { Description } from '../description.ts'
import type { Finding } from '../errors.ts'
import { descriptionShape } from '../description.ts'
import { isMarked } from '../mark.ts'
import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import type { Type } from '../type.ts'
import { shapeOf } from '../types/ref.ts'
import { isWritten } from '../written.ts'
import { keptAt } from './kept.ts'
import type { Told } from './shared.ts'
import { report } from './shared.ts'
import { isHandedOn, recordOfArrows } from './taken.ts'

/** The parts of the description that hold the records of definitions by their names. */
const parts = [
  'tables',
  'functions',
  'flows',
  'screens',
  'components',
  'services',
  'models',
  'routes',
  'incoming',
  'commands',
  'backfills',
] as const

/** The two options that are stored under another name than the author wrote, by the stored name. */
const writtenName: Record<string, string> = { plan: 'rows', writes: 'set' }

/** The type of one record of a part of the description: of the project, of the starter data, or of an entry of a map of definitions. */
function recordOfPart(part: string): Type | undefined {
  const shape = descriptionShape.kind === 'object' ? descriptionShape.shape[part] : undefined
  return shape?.kind === 'map' ? shape.of : shape
}

/** The fields of one record of a part of the description. */
function fieldsOfPart(part: string): Record<string, Type> {
  const record = recordOfPart(part)
  return record?.kind === 'object' ? record.shape : {}
}

/** What a field of a kind takes, in the words of a finding. */
const takes: Record<string, string> = {
  text: 'a text',
  number: 'a number',
  boolean: 'true or false',
  object: 'a record',
  map: 'a record',
  list: 'a list',
  choice: 'one of its words',
}

const fix = 'Give the option a value of the kind that it takes, or take it out.'

/** Reports an option that was left out, unless a finding of the definition names the option already. */
function said(told: Told, option: string, message: string): void {
  const named = (finding: { message: string }): boolean =>
    finding.message.startsWith(`${told.name}: `) &&
    (finding.message.includes(`\`${option}\``) || finding.message.includes(`\`${option}.`))
  if (!told.findings.some(named)) report(told, 'T1014', message, fix)
}

/**
 * Whether a value as it was written may be what a field of a type is made of: the value itself where it fits the
 * type, and the other forms an author writes - a definition that is handed on for a text, words of a time or a
 * size for a number, one text, one definition or one record of a word for a list, a record written in place for
 * a record, a word or a record for a rule, a type and a plan, and any of the forms of a field that has several.
 */
function mayBe(field: Type, written: unknown): boolean {
  if (!checkValue(field, written).length) return true
  if (field.kind === 'text') return isHandedOn(written)
  if (field.kind === 'number') return typeof written === 'string'
  // A word that holds when the option is left out is no word of the stored choice.
  if (field.kind === 'choice') return typeof written === 'string'
  if (field.kind === 'list')
    return Array.isArray(written) || typeof written === 'string' || isHandedOn(written) || isMarked(written)
  // An empty record is taken where the type takes one, which the first line has asked.
  if (field.kind === 'object' || field.kind === 'map') return isWritten(written) && Object.keys(written).length > 0
  if (field.kind === 'oneOf') return field.of.some((one) => mayBe(one, written))
  if (field.kind === 'ref')
    return typeof written === 'string' || isWritten(written) || mayBe(shapeOf(field.name), written)
  return false
}

/** Where an option of a definition is stored, and the type of that place: under its own name, under its stored name, or inside the one record of its helper word. */
function placeOf(
  fields: Record<string, Type>,
  stored: Stored,
  option: string,
): { in: Stored; name: string; field: Type } | undefined {
  const name = Object.keys(writtenName).find((one) => writtenName[one] === option) ?? option
  const field = keptAt(fields, name)
  if (field) return { in: stored, name, field }
  for (const [inner, type] of Object.entries(fields)) {
    const held = stored[inner]
    const within = type.kind === 'object' ? keptAt(type.shape, option) : undefined
    if (within && isStored(held) && !Object.hasOwn(writtenName, inner)) return { in: held, name: option, field: within }
  }
  return undefined
}

/**
 * Takes the record that was stored of one definition, the part of the description it stands in, and the options
 * as they were written. Holds each option that was written against what was stored of it, for what the shape
 * cannot see, since the shape takes what holds when an option is left out: T1014, by the name of the option,
 * where nothing is stored of it and its value is of another kind than its field is made of; where a record
 * stands in the place of one plain value; where it is kept as code and is no arrow; and where the shape names no
 * place for it and it is no arrow. What was stored of such an option is left out. What a written value may hold
 * at all is decided before, by the one walk.
 */
export function fitted(told: Told, part: string, stored: Stored, options: Stored): void {
  const fields = fieldsOfPart(part)
  for (const [option, written] of Object.entries(options)) {
    if (written === undefined) continue
    const place = placeOf(fields, stored, option)
    const kept = place && keptAt(place.in, place.name)
    const leave = (words: string): void => {
      if (place) delete place.in[place.name]
      said(told, option, `\`${option}\` ${words}: it is left out.`)
    }
    const kind = takes[place?.field.kind ?? ''] ?? 'a value of another kind'
    const arrow = typeof written === 'function' && !isHandedOn(written)
    if (option === recordOfArrows) {
      if (!isWritten(written)) leave('takes a record of arrows, and was handed none')
    } else if (isStored(kept) && typeof kept.export === 'string' && !arrow) {
      // A rule that a word of ours made around an arrow is kept as code too.
      if (!isMarked(written)) leave('takes an arrow, and was handed none')
    } else if (!place && !arrow) leave('takes an arrow, and was handed none')
    else if (place && !arrow) {
      // A record where one plain value stands is passed over, and what is stored there is what holds when the
      // option is left out. Any other value that is stored is held by the shape at the end.
      const plain = ['text', 'number', 'boolean', 'choice'].includes(place.field.kind)
      const record = plain && typeof written === 'object' && written !== null && !isHandedOn(written)
      // And so is a list, a number or a flag where a record stands.
      const whole = place.field.kind === 'object' || place.field.kind === 'map'
      const noRecord = whole && (Array.isArray(written) || typeof written === 'number' || typeof written === 'boolean')
      if (kept === undefined ? !mayBe(place.field, written) : record || noRecord)
        leave(`takes ${kind}, and what it was handed is none`)
    }
  }
}

/** The key of a record that a dotted way starts with, and the rest of the way: a key may hold a dot itself. */
function firstOf(record: object, path: string): [string, string] | undefined {
  for (const key of Object.keys(record)) {
    if (path === key) return [key, '']
    if (path.startsWith(`${key}.`)) return [key, path.slice(key.length + 1)]
  }
  return undefined
}

/** One record of the description that holds what was stored of a definition: its part, and how it is taken out. */
interface Kept {
  part: string
  name: string
  record: Stored
  takeOut(): void
}

/** Every record of the description that was stored of a definition, of the project and of the starter data. */
function keptIn(description: Description): Kept[] {
  const kept: Kept[] = [
    {
      part: 'project',
      name: description.app.name,
      record: description.project,
      takeOut: () => {
        description.project = {}
      },
    },
  ]
  if (description.seed)
    kept.push({ part: 'seed', name: 'seed', record: description.seed, takeOut: () => delete description.seed })
  for (const part of parts)
    for (const [name, record] of Object.entries(description[part] ?? {}))
      kept.push({ part, name, record, takeOut: () => delete description[part]?.[name] })
  return kept
}

/**
 * The last thing `describe` does. Takes the description; `toldOf`, which answers what is known of a definition
 * by its name; and `net`, which carries a piece of work out for one definition and answers whether it ended.
 * Holds what was stored of each definition as `checkDescription` holds it, each inside its net, and whatever
 * fails is T1014 on the definition whose record it stands in, by the name of the option as its author wrote it and
 * with the words of the checker, and is left out: the option, or the whole record where a field that the shape
 * requires is missing. A body that is refused, as one that hands a word a value in the place of its arrow, is
 * T0011, and its definition is left out. A definition whose walk did not end was reported by its net, and is left
 * out too. So what `describe` answers passes `checkDescription`.
 */
export function netted(
  description: Description,
  toldOf: (name: string) => Told | undefined,
  net: (told: Told, work: () => void) => boolean,
): void {
  for (const one of keptIn(description)) {
    const told = toldOf(one.name)
    const type = recordOfPart(one.part)
    if (!told || !type) continue
    const options = told.all.get(one.name)?.options ?? {}
    // Each round leaves something out of the record, or the record, so the rounds end.
    for (let left = true; left; ) {
      left = false
      const misses: Finding[] = []
      // What `checkDescription` asks, without its walk for a description that holds itself: the one walk came first.
      const walked = net(told, () => {
        misses.push(...checkInto(type, one.record))
        arrowsIn(one.record, misses)
      })
      if (!walked) one.takeOut()
      const miss = walked ? misses[0] : undefined
      if (!miss) continue
      const path = Object.keys(miss.fields ?? {})[0] ?? ''
      const words = miss.message.slice(path.length + 3, -1)
      let at = one.record
      let [field, rest] = firstOf(at, path) ?? ['', path]
      const inner = at[field]
      // The options of a helper word stand one record further in.
      if (field && !Object.hasOwn(options, field) && !Object.hasOwn(writtenName, field) && isStored(inner)) {
        at = inner
        ;[field, rest] = firstOf(inner, rest) ?? ['', rest]
      }
      const option = field ? (keptAt(writtenName, field) ?? field) : rest.split('.')[0]
      // A body is what the build read, and no option: one that is refused leaves no definition to carry out.
      if (miss.code === 'T0011' || (field === 'body' && at === one.record)) {
        one.takeOut()
        report(
          told,
          'T0011',
          `\`${path}\` ${words}, and the definition is left out.`,
          'A word that takes an arrow is handed one that is written in place.',
        )
      } else if (field) {
        delete at[field]
        left = true
        const inside = `\`${option}.${rest}\` ${words}, and \`${option}\` is left out.`
        said(told, option, rest ? inside : `\`${option}\` ${words}, and is left out.`)
      } else {
        one.takeOut()
        said(told, option, `\`${rest}\` ${words}, and the definition is left out.`)
      }
    }
  }
}
