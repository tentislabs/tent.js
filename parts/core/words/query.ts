import type { User } from '../caller.ts'
import type { QueryDb } from '../db.ts'
import type { Definition } from '../definition.ts'
import { callable } from '../definition.ts'
import type { Rule } from '../helpers/rules.ts'
import type { PlanAnswer, PlanBuilder } from '../plan.ts'
import type { Handed, HandedFields, None, Type } from '../type.ts'
import type { AtOnce, Fields, InputArgs, Names, Offer, SystemCall } from './shared.ts'

/** What the `run` of a query is handed. */
interface QueryHanded<I> {
  input: HandedFields<I>
  db: QueryDb
  user: User | undefined
  now: Date
  call: SystemCall
}

/** The options of `query`. */
export interface QueryOptions<I, Out, R, Rows> {
  access: Rule
  rows?: Rows
  run?: (o: QueryHanded<I>) => R
  about?: string
  input?: I
  output?: Out
  live?: boolean
  refresh?: string
  heavy?: boolean
  offer?: readonly Offer[]
  deprecated?: string
  system?: string
  reads?: Names
  countBy?: 'caller' | 'limits'
  plain?: true
  was?: string | readonly string[]
}

/** What a query answers: its stated output, the answer of its plan, or what its `run` answers. */
type QueryAnswer<Out, R, Rows> = Out extends Type
  ? Handed<Out>
  : Rows extends PlanBuilder<infer _Columns, infer Row, infer Mode>
    ? PlanAnswer<Row, Mode>
    : R

/** What `query` returns: a function, which answers at once. */
export type QueryDefinition<Name extends string, I, Answer, Options = object> = ((...input: InputArgs<I>) => Answer) &
  Definition<'query', Name, Options>

/**
 * Takes the name of a query and its options, of which `access` and one of `rows` and `run` are required. Answers
 * the definition, which only records them: a function whose call is handed to the runtime.
 */
export function query<
  const Name extends string,
  const I extends Fields = None,
  const Out extends Type | undefined = undefined,
  R = unknown,
  Rows = undefined,
>(
  name: Name,
  o: QueryOptions<I, Out, R, Rows> & AtOnce<R>,
): QueryDefinition<Name, I, QueryAnswer<Out, R, Rows>, QueryOptions<I, Out, R, Rows>>
export function query(name: string, o: object): object {
  return callable('query', name, o)
}
