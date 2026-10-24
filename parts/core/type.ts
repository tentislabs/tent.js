import type { TableRule } from './helpers/rules.ts'

/** Words that a form shows: text, or a message of the language files. */
type Shown = string | { message: string | readonly unknown[] }

/** The options every type takes. */
interface EveryOptions {
  optional?: boolean
  default?: unknown
  label?: Shown
  help?: Shown
}

/** The options a type also takes where it is a column. */
interface ColumnOptions {
  unique?: boolean
  index?: boolean
  private?: boolean
  personal?: boolean
  // A sealed value that is found by an equal value: a keyed fingerprint stands beside it.
  sealed?: boolean | { findable: true }
  // Who may read the column: a rule, as the rules of a table are written.
  read?: TableRule
  from?: unknown
  was?: string | readonly string[]
  by?: FilledBy
  old?: 'drop' | 'keep'
}

/** The work that fills a column: a definition, or for a vector with a model the columns whose words it is made from. */
type FilledBy =
  | { definition: string }
  | string
  | readonly string[]
  | {
      work?: { definition: string } | string
      input?: Record<string, string>
      take?: string
      columns?: readonly string[]
      batch?: number
      version?: string
      debounce?: string
      tries?: number
      order?: 'missing' | 'oldest'
      limits?: { perMinute?: number; perDay?: Record<string, number>; atLimit?: 'wait' | 'fail' }
    }

export interface TextOptions extends EveryOptions, ColumnOptions {
  min?: number
  max?: number
  pattern?: string
  lines?: 'one' | 'many'
  secret?: boolean
}

export interface NumberOptions extends EveryOptions, ColumnOptions {
  min?: number
  max?: number
  whole?: boolean
}

export interface PlainOptions extends EveryOptions, ColumnOptions {}

export interface ChoiceOptions extends EveryOptions, ColumnOptions {
  messages?: string
}

export interface LinkOptions extends EveryOptions, ColumnOptions {
  onRemove?: 'refuse' | 'remove' | 'clear'
}

export interface FileOptions extends EveryOptions, ColumnOptions {
  // A size is written in words, as '10 MB', and stored in bytes.
  maxSize?: string | number
  kinds?: readonly string[]
}

export interface ListOptions extends EveryOptions, ColumnOptions {
  min?: number
  max?: number
}

/** What a vector takes of the options of every type and of a column: it has no default, and is never unique or indexed. */
interface VectorMore {
  optional?: boolean
  label?: Shown
  help?: Shown
  private?: boolean
  personal?: boolean
  was?: string | readonly string[]
  old?: 'drop' | 'keep'
  by?: FilledBy
  // The copy in memory at one byte a number, for a column whose full copy would not fit: its search is near-exact.
  copy?: 'small'
}

export interface VectorOptions extends VectorMore {
  size: number
  // A definition that is handed on is read by its name, so a model stands here as what carries one.
  model?: { definition: string }
}

/** The options of a shape that only the description is written with. */
export interface ShapeOptions {
  optional?: boolean
}

interface TextType extends TextOptions {
  kind: 'text'
}
interface NumberType extends NumberOptions {
  kind: 'number'
}
interface BooleanType extends PlainOptions {
  kind: 'boolean'
}
interface DateType extends PlainOptions {
  kind: 'date'
}
interface DayType extends PlainOptions {
  kind: 'day'
}
interface JsonType extends PlainOptions {
  kind: 'json'
}
interface ChoiceType extends ChoiceOptions {
  kind: 'choice'
  values: readonly string[]
}
interface LinkType extends LinkOptions {
  kind: 'link'
  table: string
}
interface FileType extends FileOptions {
  kind: 'file'
}
interface ListType extends ListOptions {
  kind: 'list'
  of: Type
}
interface ObjectType extends PlainOptions {
  kind: 'object'
  shape: { readonly [field: string]: Type }
}
interface VectorType extends VectorMore {
  kind: 'vector'
  size: number
  model?: string
}
export interface OneOfType extends ShapeOptions {
  kind: 'oneOf'
  of: readonly Type[]
}
export interface MapType extends ShapeOptions {
  kind: 'map'
  of: Type
}
export interface RefType extends ShapeOptions {
  kind: 'ref'
  name: string
}

/**
 * The record of a type, as a type word answers it and as the description stores it. The last three are the shapes
 * that only the description is written with.
 */
export type Type =
  | TextType
  | NumberType
  | BooleanType
  | DateType
  | DayType
  | JsonType
  | ChoiceType
  | LinkType
  | FileType
  | ListType
  | ObjectType
  | VectorType
  | OneOfType
  | MapType
  | RefType

/** The options as they were written, refused by the type checker where they hold one that the type does not take. */
export type Only<O, Taken> = O & { [K in Exclude<keyof O, keyof Taken>]: never }

/** The options of a type word where none are written. */
export type None = Record<never, never>

/** Whether a value of the type may be left out by who gives it: it is optional, or it has a default. */
type MayLeaveOut<T> = T extends { optional: true } ? true : T extends { default: NonNullable<unknown> } ? true : false

/** Whether code may be handed nothing for a value of the type: it is optional and has no default. */
type MayBeNothing<T> = T extends { default: NonNullable<unknown> } ? false : T extends { optional: true } ? true : false

/** The fields that must be there and the fields that may be left out, as one record. */
type OneRecord<T> = { [K in keyof T]: T[K] }

type HandedValue<T> = T extends { kind: 'text' | 'day' | 'file' | 'link' }
  ? string
  : T extends { kind: 'number' }
    ? number
    : T extends { kind: 'boolean' }
      ? boolean
      : T extends { kind: 'date' }
        ? Date
        : T extends { kind: 'choice'; values: readonly (infer Value)[] }
          ? Value
          : T extends { kind: 'list'; of: infer Entry }
            ? Handed<Entry>[]
            : T extends { kind: 'object'; shape: infer Shape }
              ? HandedFields<Shape>
              : T extends { kind: 'vector' }
                ? number[]
                : unknown

export type HandedFields<Shape> = OneRecord<
  {
    -readonly [K in keyof Shape as MayBeNothing<Shape[K]> extends true ? never : K]: HandedValue<Shape[K]>
  } & {
    -readonly [K in keyof Shape as MayBeNothing<Shape[K]> extends true ? K : never]?: HandedValue<Shape[K]>
  }
>

// A moment is given as a `Date` or as text in the standard form, and code is handed a `Date`.
type GivenValue<T> = T extends { kind: 'text' | 'day' | 'file' | 'link' }
  ? string
  : T extends { kind: 'number' }
    ? number
    : T extends { kind: 'boolean' }
      ? boolean
      : T extends { kind: 'date' }
        ? Date | string
        : T extends { kind: 'choice'; values: readonly (infer Value)[] }
          ? Value
          : T extends { kind: 'list'; of: infer Entry }
            ? Given<Entry>[]
            : T extends { kind: 'object'; shape: infer Shape }
              ? GivenFields<Shape>
              : T extends { kind: 'vector' }
                ? number[]
                : unknown

export type GivenFields<Shape> = OneRecord<
  {
    -readonly [K in keyof Shape as MayLeaveOut<Shape[K]> extends true ? never : K]: GivenValue<Shape[K]>
  } & {
    -readonly [K in keyof Shape as MayLeaveOut<Shape[K]> extends true ? K : never]?: GivenValue<Shape[K]>
  }
>

/** What code is handed for a value of a type: a value that has a default is there, and a moment is a `Date`. */
export type Handed<T> = MayBeNothing<T> extends true ? HandedValue<T> | undefined : HandedValue<T>

/** What a caller gives for a value of a type: a value that is optional or has a default may be left out. */
export type Given<T> = MayLeaveOut<T> extends true ? GivenValue<T> | undefined : GivenValue<T>
