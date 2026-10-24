import type { User } from '../caller.ts'
import type { ActionDb } from '../db.ts'
import type { Definition } from '../definition.ts'
import { callable, calls } from '../definition.ts'
import type { Rule } from '../helpers/rules.ts'
import type { Trigger } from '../plan.ts'
import type { Step } from '../step.ts'
import type { Handed, HandedFields, None, Type } from '../type.ts'
import type { Working } from './action.ts'
import type { Fields, InputArgs, Offer } from './shared.ts'

/** The event of a call coming in, which an `incoming` hands the flow it names. */
interface IncomingEvent {
  kind: 'incoming'
  id?: string
  headers: Record<string, string>
  body: unknown
  params: Record<string, string>
  query: Record<string, string>
}

/**
 * The event that a flow is handed: that of its trigger, or of one of its triggers. A flow with none is started by
 * a call, with nothing, or by an `incoming`, which names the flow and not the other way round.
 */
type EventOf<On> =
  On extends Trigger<infer Event>
    ? Event
    : On extends readonly Trigger<infer Event>[]
      ? Event
      : IncomingEvent | undefined

/** What the `run` of a flow is handed. */
interface FlowHanded<I, On> {
  event: EventOf<On>
  input: HandedFields<I>
  user: User | undefined
  step: Step
  db: ActionDb
  // With `pace.batch`: the events of the starts that were gathered into the run, in their order.
  events: readonly unknown[] | undefined
}

/**
 * How the starts of a flow or an agent are paced, each part held per key, with `order` an arrow over what a
 * start is handed. A length of time is written as `'30 seconds'`.
 */
export interface PaceOver<Handed> {
  debounce?: string
  perMinute?: number
  drop?: { max: number; per: string }
  batch?: { max: number; wait?: string }
  order?: (o: Handed) => number
  turns?: 'key'
}

/** How the starts of a flow are paced. */
type Pace<I, On> = PaceOver<{ input: HandedFields<I>; event: EventOf<On> }>

/**
 * How many runs of one flow may work at once, for each key where the flow has one, and what becomes of a start
 * over that. The flows that name one `group` are counted together. With `then: 'join'` a start is answered the run
 * of its key that is under way.
 */
export interface Together {
  max?: number
  group?: string
  then?: 'wait' | 'refuse' | 'stop' | 'join'
}

/** The options of `flow`. */
export interface FlowOptions<I, Out, R, On, Follow> {
  run: (o: FlowHanded<I, On>) => R
  on?: On
  // What a run is about: the id of the row of a table trigger where it is left out.
  key?: (o: { input: HandedFields<I>; event: EventOf<On> }) => unknown
  // The events that stop the runs of the flow whose key fits, each with `key` over its data.
  stopOn?: Trigger | readonly Trigger[]
  pace?: Pace<I, On>
  // What every step of the flow saves is sealed with the key of the secrets.
  sealed?: true
  about?: string
  input?: I
  output?: Out
  limits?: { steps?: number; time?: string; result?: string; wait?: string; pass?: string; stepTime?: string }
  tries?: number | { max: number; wait?: string }
  together?: Together
  moveRuns?: 'never' | 'whenSafe'
  onFail?: (o: FlowHanded<I, On> & { failure: { step: string; code: string; message: string } }) => unknown
  // The last work of a run that was stopped, handed the step that was at work and what it kept of its progress.
  onStop?: (o: FlowHanded<I, On> & { stopped: { step?: string; progress?: unknown } }) => unknown
  as?: 'system' | 'starter'
  danger?: 'ask'
  offer?: readonly Offer[]
  access?: Rule
  system?: string
  sends?: boolean
  follow?: Follow
  countBy?: 'caller' | 'limits'
  plain?: true
  was?: string | readonly string[]
}

/** What `flow` returns: in an action, a route or a step, a function that starts a run and waits for its answer. */
export type FlowDefinition<Name extends string, I, Answer, Follow, Options = object> = ((
  ...input: InputArgs<I>
) => Promise<Answer>) &
  Definition<'flow', Name, Options> &
  (Follow extends Rule ? Working : unknown)

/**
 * Takes the name of a flow and its options, of which `run` is required. Answers the definition, which only records
 * them: a function whose call is handed to the runtime and answers a promise, with the member `working` where the
 * flow states `follow`.
 */
export function flow<
  const Name extends string,
  const I extends Fields = None,
  const Out extends Type | undefined = undefined,
  R = unknown,
  const On extends Trigger | readonly Trigger[] | undefined = undefined,
  Follow extends Rule | undefined = undefined,
>(
  name: Name,
  o: FlowOptions<I, Out, R, On, Follow>,
): FlowDefinition<Name, I, Out extends Type ? Handed<Out> : Awaited<R>, Follow, FlowOptions<I, Out, R, On, Follow>>
export function flow(name: string, o: object): object {
  const made = callable('flow', name, o)
  return 'follow' in o && o.follow !== undefined ? Object.assign(made, { working: calls(`${name}.working`) }) : made
}
