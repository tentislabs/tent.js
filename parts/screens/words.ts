import { partHeld } from './page/parts.ts'
import { zoneNow } from './page/viewZone.ts'

/**
 * Calls a value word that a view may hold, by its name: the word is the core's own, held by a part of the page
 * code that a page loads with a screen that calls one, so that the page every screen loads stays small.
 */
function called(name: string, values: unknown[]): unknown {
  const part = partHeld('values')
  const word: unknown = part ? Reflect.get(part.words, name) : undefined
  if (typeof word !== 'function')
    throw new Error(`The value word ${name} is held by a part of the page code that is not loaded.`)
  return Reflect.apply(word, undefined, values)
}

/** The values joined as one text. */
export function concat(...values: unknown[]): string
export function concat(...values: unknown[]): unknown {
  return called('concat', values)
}

/** What the sign it names works out of two values. */
export function calc(op: '+' | '-' | '*' | '/' | '%', a: number, b: number): number
export function calc(op: '==' | '!=' | '<' | '<=' | '>' | '>=', a: unknown, b: unknown): boolean
export function calc(...values: unknown[]): unknown {
  return called('calc', values)
}

/** A number rounded to a count of digits after its point. */
export function round(n: number, digits?: number): number
export function round(...values: unknown[]): unknown {
  return called('round', values)
}

/** A number rounded down. */
export function floor(n: number): number
export function floor(...values: unknown[]): unknown {
  return called('floor', values)
}

/** A number rounded up. */
export function ceil(n: number): number
export function ceil(...values: unknown[]): unknown {
  return called('ceil', values)
}

/** The smallest of two or more values. */
export function least<Value>(a: Value, b: Value, ...more: Value[]): Value
export function least(...values: unknown[]): unknown {
  return called('least', values)
}

/** The largest of two or more values. */
export function most<Value>(a: Value, b: Value, ...more: Value[]): Value
export function most(...values: unknown[]): unknown {
  return called('most', values)
}

/** A text in small letters, by no language's own rules. */
export function lower(text: string): string
export function lower(...values: unknown[]): unknown {
  return called('lower', values)
}

/** A text in capitals, by no language's own rules. */
export function upper(text: string): string
export function upper(...values: unknown[]): unknown {
  return called('upper', values)
}

/** A text without the room at its two ends. */
export function trim(text: string): string
export function trim(...values: unknown[]): unknown {
  return called('trim', values)
}

/** Whether a text starts with a part, capitals of the plain letters not counting. */
export function startsWith(text: string, part: string): boolean
export function startsWith(...values: unknown[]): unknown {
  return called('startsWith', values)
}

/** Whether a text holds a part, or a list a value. */
export function contains(text: string, part: string): boolean
export function contains(list: readonly unknown[], value: unknown): boolean
export function contains(...values: unknown[]): unknown {
  return called('contains', values)
}

/** A piece of a text or of a list. */
export function slice(text: string, from: number, to?: number): string
export function slice<Entry>(list: readonly Entry[], from: number, to?: number): Entry[]
export function slice(...values: unknown[]): unknown {
  return called('slice', values)
}

/** The entries of a list as one text, with a text between them. */
export function join(list: readonly unknown[], between: string): string
export function join(...values: unknown[]): unknown {
  return called('join', values)
}

/** The numbers from one up to another, by a step. */
export function range(from: number, to: number, by?: number): number[]
export function range(...values: unknown[]): unknown {
  return called('range', values)
}

/** The rows that fit a written filter. */
export function where<Row>(rows: readonly Row[], filter: object): Row[]
export function where(...values: unknown[]): unknown {
  return called('where', values)
}

/** The sum of the numbers of a list, or of a field of each entry. */
export function sum(list: readonly unknown[], field?: string): number
export function sum(...values: unknown[]): unknown {
  return called('sum', values)
}

/** The mean of the numbers of a list, or of a field of each entry. */
export function avg(list: readonly unknown[], field?: string): number | undefined
export function avg(...values: unknown[]): unknown {
  return called('avg', values)
}

/** The smallest entry of a list, or of a field of each entry. */
export function min<Entry>(list: readonly Entry[]): Entry | undefined
export function min(list: readonly unknown[], field: string): unknown
export function min(...values: unknown[]): unknown {
  return called('min', values)
}

/** The largest entry of a list, or of a field of each entry. */
export function max<Entry>(list: readonly Entry[]): Entry | undefined
export function max(list: readonly unknown[], field: string): unknown
export function max(...values: unknown[]): unknown {
  return called('max', values)
}

/** A new list of what an arrow gives for each entry. */
export function each<Entry, Made>(list: readonly Entry[], arrow: (entry: Entry, i: number) => Made): Made[]
export function each(...values: unknown[]): unknown {
  return called('each', values)
}

/** A moment or a day moved on by a length of time. */
export function later<When extends Date | string | undefined>(when: When, length: string): When
export function later(...values: unknown[]): unknown {
  return called('later', values)
}

/** A moment or a day moved back by a length of time. */
export function earlier<When extends Date | string | undefined>(when: When, length: string): When
export function earlier(...values: unknown[]): unknown {
  return called('earlier', values)
}

/** How many whole units lie from one moment or day to another. */
export function between(a: Date | string, b: Date | string, unit: string): number
export function between(...values: unknown[]): unknown {
  return called('between', values)
}

/** The calendar day of a moment in a time zone: in a view that names none, the zone of the page. */
export function dayOf(moment: Date | string, zone?: string): string
export function dayOf(...values: unknown[]): unknown {
  const zone = values[1] ?? zoneNow()
  return called('dayOf', zone === undefined ? [values[0]] : [values[0], zone])
}
