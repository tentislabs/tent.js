import { TentError } from '../errors.ts'
import { mark } from '../mark.ts'
import { asValue, asValues } from '../written.ts'

/** A secret by its name: a definition never holds the value. */
export interface Secret {
  secret: string
}

/** A setting of the project by its name: what it holds is read where it is used, as it stands then. */
export interface Setting {
  setting: string
}

/** An asset by its name. */
export interface Asset {
  asset: string
}

/**
 * A message of the language files by its key, which is drawn in the language of the page. A key that is built from a
 * value is a list of its parts, joined with dots: `['status', 'paid']` is the key `status.paid`. It is typed as the
 * text it stands for, so that a view writes it among its elements; what it holds is its record.
 */
export type Message = string & {
  readonly message: string | readonly unknown[]
  readonly with?: Record<string, unknown>
}

/** Takes the name of a secret. Answers the record that stands for it. */
export function secret(name: string): Secret {
  return mark({ secret: name })
}

/** Takes the name of a setting of the project. Answers the record that stands for it. */
export function setting(name: string): Setting {
  return mark({ setting: name })
}

/** Takes the name of a file under the assets of the project. Answers the record that stands for it. */
export function asset(name: string): Asset {
  return mark({ asset: name })
}

/**
 * Takes the key of a message of the language files, or a list of its parts, and the values its places hold. Answers
 * the record that stands for it.
 */
export function message(key: string | readonly unknown[], values?: Record<string, unknown>): Message
export function message(key: string | readonly unknown[], values?: Record<string, unknown>): unknown {
  const written = Array.isArray(key) ? key.map(asValue) : key
  return mark(values === undefined ? { message: written } : { message: written, with: asValues(values) })
}

// A reference stands where a value does, so it is typed as the value it stands for, which the place it is written
// in says. What it answers is its record, which is worked out when the definition is carried out.

/** Takes the name of an input field. Answers the record that stands for the value that was given for it. */
export function input<Value>(name: string): Value
export function input(name: string): unknown {
  return mark({ input: name })
}

/** Takes `'id'`, the one form it has. Answers the record that stands for the id of the caller. Throws T1014 for any other. */
export function caller<Value = string>(what: 'id'): Value
export function caller(what: string): unknown {
  if (what !== 'id')
    throw new TentError('T1014', `caller is handed ${JSON.stringify(what)}, and \`caller('id')\` is its only form.`, {
      fix: "Write `caller('id')`, and read what else the caller is in code, from `user`.",
    })
  return mark({ caller: what })
}

/** Takes the name of a column of the same row. Answers the record that stands for its value, in a `from`. */
export function col<Value>(name: string): Value
export function col(name: string): unknown {
  return mark({ col: name })
}

/**
 * Takes the value of an entry of a filter. Answers the record that leaves the entry out while the value is nothing,
 * empty text or an empty list.
 */
export function given<Value>(value: Value): Value
export function given(value: unknown): unknown {
  return mark({ given: asValue(value) })
}
