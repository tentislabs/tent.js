import type { Finding } from './errors.ts'
import { finding } from './finding.ts'
import { isRequired } from './required.ts'
import { isDay, momentOf } from './time.ts'
import type { Type } from './type.ts'
import { shapeOf } from './types/ref.ts'
import { isWritten } from './written.ts'

/** The name of the check that a field failed. */
type Check = 'required' | 'type' | 'min' | 'max' | 'pattern' | 'values' | 'unknown'

/** Makes the finding of one field that does not fit: T0002, with the dotted name of the field and the check it failed. */
export const missOf = (path: string, check: Check, words: string): Finding =>
  finding('T0002', `${path ? `\`${path}\`` : 'The value'} ${words}.`, { fields: { [path]: check } })

/**
 * The way to a field while a value is walked: the name of the field, and the way to what holds it. Its dotted
 * name is written out only for a field that does not fit, since most fields fit.
 */
type Way = { up: Way; name: string | number } | undefined

const below = (up: Way, name: string | number): Way => ({ up, name })

function dotted(way: Way): string {
  const names: (string | number)[] = []
  for (let at = way; at; at = at.up) names.push(at.name)
  return names.reverse().join('.')
}

/**
 * Where the misses of one check go. Where a value is tried against one shape of several, they are counted and not
 * made: `at` is the place that is tried, and `typed` whether the value is of another kind there.
 */
interface Sink {
  found?: Finding[]
  count: number
  at: Way
  typed: boolean
}

/** Notes one field that does not fit. */
function note(sink: Sink, path: Way, check: Check, words: string): void {
  sink.count++
  if (check === 'type' && path === sink.at) sink.typed = true
  sink.found?.push(missOf(dotted(path), check, words))
}

/** The number of characters of a text, a character outside the first plane counted once, as JSON Schema counts. */
function charactersOf(text: string): number {
  let length = 0
  for (const _ of text) length++
  return length
}

/** Holds a number of a text, of a number or of a list against the `min` and the `max` of its type. */
function bounds(type: { min?: number; max?: number }, size: number, path: Way, words: string, found: Sink) {
  if (type.min !== undefined && size < type.min) note(found, path, 'min', `${words} under ${type.min}`)
  if (type.max !== undefined && size > type.max) note(found, path, 'max', `${words} over ${type.max}`)
}

/**
 * Holds a value of a place for any JSON to be what JSON holds, however deep: text, a number that JSON writes, true,
 * false, nothing, a list, and a record that was written in place.
 */
function data(value: unknown, path: Way, found: Sink): void {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' ? Number.isFinite(value) : Array.isArray(value) || isWritten(value)) {
    if (typeof value === 'object') for (const [name, one] of Object.entries(value)) data(one, below(path, name), found)
  } else note(found, path, 'type', 'is no JSON')
}

/**
 * Whether a value that is there cannot fit a type, as far as a glance tells: it is of another kind, or it lacks a
 * field that a record requires. What this answers true for, `check` finds a miss for.
 */
function cannotFit(type: Type, value: unknown): boolean {
  switch (type.kind) {
    case 'text':
    case 'choice':
    case 'link':
    case 'file':
      return typeof value !== 'string'
    case 'number':
      return typeof value !== 'number'
    case 'boolean':
      return typeof value !== 'boolean'
    case 'list':
    case 'vector':
      return !Array.isArray(value)
    case 'map':
      return !isWritten(value)
    case 'object': {
      if (!isWritten(value)) return true
      // A record with a field that the shape does not name is no record of that shape.
      for (const name in value) if (value[name] !== undefined && !Object.hasOwn(type.shape, name)) return true
      for (const name of Object.keys(type.shape)) {
        const field = type.shape[name]
        if (!isRequired(field)) continue
        const held = value[name]
        if (held === undefined || held === null) return true
        // The shapes of a kind are told apart by one word, as a type is by its `kind`.
        if (field.kind === 'choice' && !(typeof held === 'string' && field.values.includes(held))) return true
      }
      return false
    }
    case 'ref':
      return cannotFit(shapeOf(type.name), value)
    case 'oneOf':
      return type.of.every((one) => cannotFit(one, value))
    default:
      return false
  }
}

/** Holds one value against its type, and adds each field that does not fit to `found` under its dotted name. */
function check(type: Type, value: unknown, path: Way, found: Sink): void {
  // Nothing and `null` both mean that the value was not given.
  if (value === undefined || value === null) {
    if (isRequired(type)) note(found, path, 'required', 'is required and was not given')
    return
  }
  switch (type.kind) {
    case 'text':
      if (typeof value !== 'string') note(found, path, 'type', 'is no text')
      else {
        if (type.min !== undefined || type.max !== undefined)
          bounds(type, charactersOf(value), path, 'has a number of characters', found)
        if (type.pattern !== undefined && !new RegExp(type.pattern, 'u').test(value))
          note(found, path, 'pattern', `does not fit the pattern ${type.pattern}`)
      }
      return
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) note(found, path, 'type', 'is no number')
      else if (type.whole === true && !Number.isInteger(value)) note(found, path, 'type', 'is no whole number')
      else bounds(type, value, path, 'is', found)
      return
    case 'boolean':
      if (typeof value !== 'boolean') note(found, path, 'type', 'is neither true nor false')
      return
    case 'date':
      if (momentOf(value) === undefined)
        note(found, path, 'type', 'is no moment: neither a `Date` nor text in the standard form')
      return
    case 'day':
      if (!isDay(value)) note(found, path, 'type', 'is no day in the form 2026-10-08')
      return
    case 'json':
      data(value, path, found)
      return
    case 'choice':
      if (typeof value !== 'string') note(found, path, 'type', 'is no text')
      else if (!type.values.includes(value))
        note(found, path, 'values', `is none of ${type.values.map((one) => `'${one}'`).join(', ')}`)
      return
    case 'link':
    case 'file':
      if (typeof value !== 'string' || value === '') note(found, path, 'type', 'is no id')
      return
    case 'list':
      if (!Array.isArray(value)) note(found, path, 'type', 'is no list')
      else {
        bounds(type, value.length, path, 'has a number of entries', found)
        for (const [k, entry] of value.entries()) check(type.of, entry, below(path, k), found)
      }
      return
    case 'object':
      if (!isWritten(value)) note(found, path, 'type', 'is no record')
      else {
        for (const name of Object.keys(type.shape)) check(type.shape[name], value[name], below(path, name), found)
        // An input never carries more than was declared.
        for (const name of Object.keys(value))
          if (!Object.hasOwn(type.shape, name) && value[name] !== undefined)
            note(found, below(path, name), 'unknown', 'is no field that was declared')
      }
      return
    case 'vector':
      if (
        !Array.isArray(value) ||
        value.length !== type.size ||
        !value.every((one) => typeof one === 'number' && Number.isFinite(one))
      )
        note(found, path, 'type', `is no list of ${type.size} ${type.size === 1 ? 'number' : 'numbers'}`)
      return
    case 'oneOf': {
      // The words of the type that the value is nearest to: one that fits it in kind, with the fewest misses. Each
      // shape that the value may fit, by what it is at a glance, is tried with its misses counted and not made:
      // most values fit one, and the words are made for the nearest alone, where none fits.
      const counted = (one: Type): Sink => {
        const tried: Sink = { count: 0, at: path, typed: false }
        check(one, value, path, tried)
        return tried
      }
      let nearest: Type | undefined
      let fewest = Number.POSITIVE_INFINITY
      for (const one of type.of) {
        if (cannotFit(one, value)) continue
        const tried = counted(one)
        if (!tried.count) return
        if (!tried.typed && tried.count < fewest) {
          nearest = one
          fewest = tried.count
        }
      }
      // Where the value is itself only tried against a shape, how far it misses is all that is asked.
      if (!found.found) {
        found.count += nearest ? fewest : 1
        if (!nearest && path === found.at) found.typed = true
        return
      }
      // The words are asked for: now every shape is tried, also one that the value cannot fit at a glance, in
      // the order they stand in.
      nearest = undefined
      fewest = Number.POSITIVE_INFINITY
      for (const one of type.of) {
        const tried = counted(one)
        if (!tried.typed && tried.count < fewest) {
          nearest = one
          fewest = tried.count
        }
      }
      if (nearest) check(nearest, value, path, found)
      else note(found, path, 'type', 'fits none of the shapes it may have')
      return
    }
    case 'map':
      if (!isWritten(value)) note(found, path, 'type', 'is no record')
      else
        for (const [name, one] of Object.entries(value))
          if (one !== undefined) check(type.of, one, below(path, name), found)
      return
    case 'ref':
      check(shapeOf(type.name), value, path, found)
      return
  }
}

/**
 * Takes a type, and a value that a walk has taken already: it holds nothing of itself and is no deeper than the
 * walk let it be. Answers a finding for each field that does not fit.
 */
export function checkInto(type: Type, value: unknown): Finding[] {
  const found: Finding[] = []
  check(type, value, undefined, { found, count: 0, at: undefined, typed: false })
  return found
}
