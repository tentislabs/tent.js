import type { User } from '../caller.ts'
import type { ActionDb } from '../db.ts'
import type { Definition, Marker } from '../definition.ts'
import { memberNames, memberTypes } from '../agentTypes.ts'
import { callable, calls } from '../definition.ts'
import type { OwnGuard } from '../helpers/guards.ts'
import type { Judge } from '../helpers/judge.ts'
import type { Rule } from '../helpers/rules.ts'
import type { Trigger } from '../plan.ts'
import type { Step } from '../step.ts'
import type { Handed, Type } from '../type.ts'
import type { PaceOver, Together } from './flow.ts'
import type { Offer, Units } from './shared.ts'

/** A tool of an agent: a definition, or a record that says more of it for this agent. */
type Tool = Marker | { tool: Marker; tries?: number; about?: string; line?: false; name?: string }

/** A guard of an agent: a function or a flow handed `{ text, from }` that answers `{ pass, why? }`, a judge, or one of ours. */
type Guard = Marker | OwnGuard | Judge

/** What an agent may read, change and call in a workspace. */
interface Policy {
  read?: readonly string[]
  edit?: readonly string[]
  create?: readonly string[]
  remove?: readonly string[]
  tools?: readonly string[]
  ask?: readonly string[]
  reaches?: readonly string[]
  also?: readonly string[]
  mode?: 'build' | 'propose' | 'frozen'
}

/** The options of `agent`, with the type of its typed answer where it states one. */
interface AgentOptions<Out extends Type | undefined = Type | undefined> {
  model: Marker
  instructions: string
  tools: readonly Tool[]
  limits?: {
    steps?: number
    perRun?: Units
    time?: string
    ask?: string
    result?: string
    toolCalls?: number
    toolsAtOnce?: number
    pass?: string
  }
  about?: string
  access?: Rule
  offer?: readonly Offer[]
  on?: Trigger | readonly Trigger[]
  memory?: {
    in: Marker
    thread?: string
    of?: string
    keep?: number
    after?: number
    shrink?: 'all' | 'drop' | 'summary' | Marker | { nearest: number }
    model?: Marker
    recall?: number
  }
  voice?: { hear: Marker; speak: Marker; name?: string; language?: string; whole?: boolean }
  trust?: readonly Marker[]
  knows?: readonly ('caller' | 'time' | { facts: Marker })[]
  together?: Together
  // What a run is about, over what its start is handed, as the `key` of a flow; `pace` and `onStop` as a flow's.
  key?: (o: Started) => unknown
  pace?: PaceOver<Started>
  onStop?: (o: {
    input: AgentInput
    event: unknown
    user: User | undefined
    step: Step
    db: ActionDb
    stopped: { step?: string; progress?: unknown }
  }) => unknown
  words?: Record<string, string>
  driver?: string
  policy?: Policy
  reasoning?: { show?: true; save?: true }
  tell?: 'tools' | 'list'
  sequence?: true
  output?: Out
  guards?: { in?: readonly Guard[]; out?: readonly Guard[]; refused?: string }
  handsOver?: readonly Marker[]
  questions?: true
  score?: { share: number; with: Judge }
  countBy?: 'caller' | 'limits'
  was?: string | readonly string[]
}

/** What the arrows of a start of an agent are handed: what the start takes, and the event of its trigger. */
interface Started {
  input: AgentInput
  event: unknown
}

/** What a start of an agent takes. */
interface AgentInput {
  message: string
  thread?: string
  files?: readonly string[]
  audio?: string
  speak?: boolean
}

/** An ask that waits for a person, as `working` and a hook name it. */
interface WaitingAsk {
  run: string
  step: string
  repeat: number
  n: number
  tool: string
  input: unknown
  call?: string
  sequence?: unknown
  more?: boolean
}

/** One entry of `working`: a run of the agent of the caller's, or one of another that holds the conversation. */
interface WorkingEntry {
  id: string
  run: string
  state: 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'stopped'
  error?: { code: string; message: string }
  text?: string
  reasoning?: string
  message?: string
  theirs?: true
  under: { run: string; tool: string; state: string }[]
  asks: WaitingAsk[]
}

/** Which ask of a run is answered: the run that asks, its step, the pass of that step and the ask of that pass. */
interface Answering {
  run: string
  step: string
  repeat?: number
  n?: number
}

/** A member of an agent: what it takes and answers, and its kind, as a page calls or reads it. */
type Member<Kind extends string, Input, Answer> = ((input: Input) => Promise<Answer>) & Marker & { readonly kind: Kind }

/** What a run of an agent answers: its text, and the value of its type where it states `output`. */
type AgentAnswer<Out> = { text: string } & (Out extends Type ? { value: Handed<Out> } : unknown)

/** What `agent` returns: a function that starts a run and answers its text, and the six members of an agent. */
type AgentDefinition<Name extends string, Out, Options = object> = ((input: AgentInput) => Promise<AgentAnswer<Out>>) &
  Definition<'agent', Name, Options> & {
    readonly working: Member<'query', { thread?: string; run?: string } | undefined, WorkingEntry[]>
    readonly approve: Member<'action', Answering, null>
    readonly refuse: Member<'action', Answering, null>
    readonly stop: Member<'action', { run: string } | { thread: string }, null>
    readonly answer: Member<'action', Answering & { value: unknown }, null>
    readonly rate: Member<'action', { run: string; score: number; note?: string }, null>
  }

/**
 * Takes the name of an agent and its options, of which `model`, `instructions` and `tools` are required; its
 * `limits` are the builder's to set, and none is set for them. Answers the definition, which only records them and is stored as a flow: a function whose call is
 * handed to the runtime, with a marker for each of its four members.
 */
export function agent<const Name extends string, const Out extends Type | undefined = undefined>(
  name: Name,
  o: AgentOptions<Out>,
): AgentDefinition<Name, Out, AgentOptions<Out>>
export function agent(name: string, o: object): object {
  const made = callable('agent', name, o)
  // A name that is no text names no member: `describe` says what is wrong with the definition.
  const named = typeof name === 'string' ? name : ''
  return Object.assign(
    made,
    Object.fromEntries(
      memberNames.map((member) => [
        member,
        Object.assign(calls(`${named}.${member}`), { kind: memberTypes[member].kind }),
      ]),
    ),
  )
}
