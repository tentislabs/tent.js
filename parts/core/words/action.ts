import type { User } from '../caller.ts'
import type { ActionDb } from '../db.ts'
import type { Definition, Marker } from '../definition.ts'
import { callable, calls } from '../definition.ts'
import type { Rule } from '../helpers/rules.ts'
import type { HandedFields, None, Type } from '../type.ts'
import type {
  Awaitable,
  Fields,
  HeavyHanded,
  HeavyOptions,
  InputArgs,
  Offer,
  Result,
  Stated,
  SystemCall,
  Units,
} from './shared.ts'

/** What the `run` of an action is handed. The members of heavy work are there where the action states it. */
interface ActionHanded<I> extends HeavyHanded {
  input: HandedFields<I>
  user: User | undefined
  db: ActionDb
  about: { from: string; origin: string } | undefined
  call: SystemCall
}

/** The limits of an action. */
export interface ActionLimits {
  time?: string
  try?: string
  reserve?: string
  lost?: number
  perDay?: Units
  atLimit?: 'wait' | 'fail'
  runKept?: string
}

/** The options of `action`. */
export interface ActionOptions<I, Out, Follow> extends HeavyOptions {
  access: Rule
  run: (o: ActionHanded<I>) => Awaitable<Result<Out>>
  about?: string
  input?: I
  output?: Out
  danger?: 'none' | 'ask'
  sends?: boolean
  follow?: Follow
  offer?: readonly Offer[]
  deprecated?: string
  system?: string
  countBy?: 'caller' | 'limits'
  limits?: ActionLimits
  plain?: true
  was?: string | readonly string[]
}

/** The member `working`, which a run that is followed gives. */
export interface Working {
  working: ((input?: unknown) => Promise<unknown>) & Marker
}

/** What `action` returns: a function, which answers a promise. */
export type ActionDefinition<Name extends string, I, Out, Follow, Options = object> = ((
  ...input: InputArgs<I>
) => Promise<Stated<Out>>) &
  Definition<'action', Name, Options> &
  (Follow extends Rule ? Working : unknown)

/**
 * Takes the name and the options of an action. Answers the function whose call is handed to the runtime, with the
 * member `working` where the action is a run that is followed.
 */
export function actionOf(name: string, o: object): object {
  const made = callable('action', name, o)
  return 'follow' in o && o.follow !== undefined ? Object.assign(made, { working: calls(`${name}.working`) }) : made
}

/**
 * Takes the name of an action and its options, of which `access` and `run` are required. Answers the definition,
 * which only records them: a function whose call is handed to the runtime and answers a promise.
 */
export function action<
  const Name extends string,
  const I extends Fields = None,
  const Out extends Type | undefined = undefined,
  Follow extends Rule | undefined = undefined,
>(name: Name, o: ActionOptions<I, Out, Follow>): ActionDefinition<Name, I, Out, Follow, ActionOptions<I, Out, Follow>>
export function action(name: string, o: object): object {
  return actionOf(name, o)
}
