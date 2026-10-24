import { madeBy } from '../definition.ts'
import type { Rule } from '../helpers/rules.ts'
import type { None, Type } from '../type.ts'
import type { ActionDefinition, ActionLimits } from './action.ts'
import { actionOf } from './action.ts'
import type { Fields, HeavyOptions, Offer } from './shared.ts'

/** The options of `python`. */
interface PythonOptions<I, Out, Follow> extends HeavyOptions {
  file: string
  input: I
  output: Out
  access: Rule
  packages?: readonly string[]
  files?: readonly string[]
  lock?: string
  limits?: ActionLimits & { memory?: string; load?: string }
  gpu?: boolean
  atOnce?: number
  sends?: boolean
  follow?: Follow
  countBy?: 'caller' | 'limits'
  about?: string
  danger?: 'none' | 'ask'
  offer?: readonly Offer[]
  deprecated?: string
  system?: string
  was?: string | readonly string[]
}

/**
 * Takes the name of a `python` and its options, of which `file`, `input`, `output` and `access` are required.
 * Answers the definition, which only records them and is stored as an action: a function whose call is handed to
 * the runtime and answers a promise.
 */
export function python<
  const Name extends string,
  const I extends Fields = None,
  const Out extends Type = Type,
  Follow extends Rule | undefined = undefined,
>(name: Name, o: PythonOptions<I, Out, Follow>): ActionDefinition<Name, I, Out, Follow, PythonOptions<I, Out, Follow>>
export function python(name: string, o: object): object {
  return madeBy(actionOf(name, o), 'python')
}
