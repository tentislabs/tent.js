import type { User } from '../caller.ts'
import type { ChangeDb } from '../db.ts'
import type { Definition } from '../definition.ts'
import { callable } from '../definition.ts'
import type { Rule } from '../helpers/rules.ts'
import type { Write } from '../plan.ts'
import type { Handed, HandedFields, None, Type } from '../type.ts'
import type { AtOnce, Fields, InputArgs, Names, Offer, SystemCall } from './shared.ts'

/** What the `run` of a change is handed. */
interface ChangeHanded<I> {
  input: HandedFields<I>
  db: ChangeDb
  user: User | undefined
  now: Date
  call: SystemCall
}

/** The options of `change`. */
export interface ChangeOptions<I, Out, R, Set> {
  access: Rule
  set?: Set
  run?: (o: ChangeHanded<I>) => R
  about?: string
  input?: I
  output?: Out
  danger?: 'none' | 'ask'
  offer?: readonly Offer[]
  deprecated?: string
  system?: string
  touches?: Names
  countBy?: 'caller' | 'limits'
  everywhere?: boolean
  plain?: true
  was?: string | readonly string[]
}

/** What a change answers: its stated output, the row of its one write, a list for a list of writes, or nothing. */
type ChangeAnswer<Out, Set> = Out extends Type
  ? Handed<Out>
  : Set extends Write<infer Row>
    ? Row
    : Set extends readonly Write[]
      ? unknown[]
      : undefined

/** What `change` returns: a function, which answers at once. */
export type ChangeDefinition<Name extends string, I, Answer, Options = object> = ((...input: InputArgs<I>) => Answer) &
  Definition<'change', Name, Options>

/**
 * Takes the name of a change and its options, of which `access` and one of `set` and `run` are required. Answers
 * the definition, which only records them: a function whose call is handed to the runtime.
 */
export function change<
  const Name extends string,
  const I extends Fields = None,
  const Out extends Type | undefined = undefined,
  R = unknown,
  Set extends Write | readonly Write[] | undefined = undefined,
>(
  name: Name,
  o: ChangeOptions<I, Out, R, Set> & AtOnce<R>,
): ChangeDefinition<Name, I, ChangeAnswer<Out, Set>, ChangeOptions<I, Out, R, Set>>
export function change(name: string, o: object): object {
  return callable('change', name, o)
}
