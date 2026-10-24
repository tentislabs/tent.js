import type { Seeing } from '../itself.ts'
import { isMarked } from '../mark.ts'
import { planOf } from '../planOf.ts'
import { isWritten } from '../written.ts'

/**
 * The options that take an arrow, which is read as a body or kept as code. Every option that takes a function is
 * named here, or in the record below: the walk refuses a function at any other place, so a new one is added.
 */
const arrows = ['run', 'onFail', 'onStop', 'identify', 'onRequest', 'view', 'data', 'title', 'key']

/** The one option whose arrows stand inside a record, and which is kept as code whole. */
export const recordOfArrows = 'build'

/** The options whose fields may each be an arrow, which is read or kept as code by itself: of a screen and of a flow. */
const fieldsOfArrows = ['seo', 'pace']

/** Whether a value is a definition or a marker that is handed on, which is stored as its name. */
export const isHandedOn = (written: unknown): boolean =>
  (typeof written === 'object' || typeof written === 'function') &&
  written !== null &&
  typeof Reflect.get(written, 'definition') === 'string'

/**
 * Takes the options of a definition as they were written, or nothing for what is no record of options, as a body
 * that was read. Answers what the walk asks of each thing in it, which is what a written value may hold at any
 * depth: text, a number that JSON writes, true, false, nothing, a list, a record that was written in place, a
 * thing that a word of ours made, and a function where the option at that place takes one. A thing that a word of
 * ours made is taken as it is, and is not stepped into - a record of a word, a plan, a definition that is handed
 * on: the word held what it was handed when it made it.
 */
export function takenIn(options: object | undefined): Seeing {
  let build: unknown
  let fields: unknown
  return (one, holder, name) => {
    if (typeof one === 'number') return Number.isFinite(one) ? undefined : 'is no number that JSON writes'
    if (typeof one === 'bigint') return 'is a `bigint`'
    if (typeof one === 'symbol') return 'is a symbol'
    if (typeof one === 'function') {
      const atArrow =
        holder !== undefined && (holder === build || holder === fields || (holder === options && arrows.includes(name)))
      return isHandedOn(one) || atArrow ? undefined : 'is a function where the option takes none'
    }
    if (typeof one !== 'object' || one === null || isMarked(one) || planOf(one)) return undefined
    if (holder !== undefined && isHandedOn(one)) return undefined
    if (!Array.isArray(one) && !isWritten(one))
      return one instanceof Date ? 'is a `Date`' : 'is a thing that a class made'
    if (holder !== undefined && holder === options && name === recordOfArrows) build = one
    if (holder !== undefined && holder === options && fieldsOfArrows.includes(name)) fields = one
    return one
  }
}
