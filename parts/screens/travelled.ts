/**
 * A value as a screen is handed it: what the wire carries. A moment is text in the standard form and never a
 * `Date`, at any depth.
 */
export type Travelled<Value> = Value extends Date
  ? string
  : Value extends readonly (infer Entry)[]
    ? Travelled<Entry>[]
    : Value extends (...args: never[]) => unknown
      ? Value
      : Value extends object
        ? { [Name in keyof Value]: Travelled<Value[Name]> }
        : Value

/** A definition as a screen file holds it: its name and its kind. Its type is that of the real definition. */
export interface Stub<Kind extends string = string> {
  readonly definition: string
  readonly kind: Kind
}

/** The input of a function, as a screen gives it: the first thing its call takes. */
export type InputOf<What> = What extends (...args: infer Args) => unknown ? Args[0] : Record<string, unknown>

/** The answer of a function, as it reaches a screen. */
export type AnswerOf<What> = What extends (...args: never[]) => infer Answer ? Travelled<Awaited<Answer>> : unknown
