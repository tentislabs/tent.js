import type { ChoiceOptions, None, Only } from '../type.ts'

/** Takes the values to choose from, and the options. Answers the record of the type. */
export function choice<const Values extends readonly string[], const O extends ChoiceOptions = None>(
  values: Values,
  o?: Only<O, ChoiceOptions>,
): { kind: 'choice'; values: Values } & NoInfer<O> {
  return Object.assign({ kind: 'choice' as const, values }, o)
}
