import { isStored } from '../../core/internal.ts'
import type { Judge, Type } from '../../core/index.ts'
import type { ToolEntry } from '../../core/internal.ts'
import { isType } from '../isType.ts'

/** A guard of an agent: a definition by its name, a judge by the name of its model, or a guard of the engine's own. */
export interface GuardOf {
  name: string
  ours?: true
  judge?: Judge['judge']
}

/** The memory of an agent, with its defaults. */
interface MemoryOf {
  in: string
  thread: string
  keep: number
  after: number
  shrink: 'all' | 'drop' | 'summary' | { function: string } | { flow: string } | { nearest: number }
  model?: string
  of?: string
  // How many older messages of every conversation of the starter are recalled by meaning.
  recall?: number
}

/** What the driver reads of an agent: its record, with the defaults of what it leaves out. */
export interface AgentOf {
  name: string
  model: string
  instructions: string
  tools: ToolEntry[]
  limits: {
    steps: number
    perRun: Record<string, number>
    time: number
    ask: number
    result: number
    toolCalls: number
    toolsAtOnce: number
    pass: number
  }
  memory?: MemoryOf
  knows: ('caller' | 'time')[]
  // The table of facts about the person that `knows` names.
  facts?: string
  reasoning: { show?: true; save?: true }
  tell: 'tools' | 'list'
  sequence: boolean
  trust: string[]
  words: Record<string, string>
  voice?: { hear: string; speak: string; name?: string; language?: string; whole?: true }
  driver?: string
  // The type of the typed answer, where the agent states `output`.
  output?: Type
  guards: { in: GuardOf[]; out: GuardOf[]; refused?: string }
  // The agents a conversation may be handed over to, and whether the model may ask the person a question.
  handsOver: string[]
  questions: boolean
  // The share of finished runs that a judge scores, and the judge.
  score?: { share: number; with: Judge['judge'] }
}

const numberOf = (value: unknown, otherwise: number): number => (typeof value === 'number' ? value : otherwise)

/** A judge as it is stored: its model by name, the rule, the score at which it passes, its words and its kind. */
function judgeOf(stored: Record<string, unknown>): Judge['judge'] {
  return {
    model: String(stored.model),
    rule: String(stored.rule),
    pass: numberOf(stored.pass, 0.7),
    ...(typeof stored.words === 'string' ? { words: stored.words } : {}),
    ...(stored.kind === 'fromTools' || stored.kind === 'onTask' ? { kind: stored.kind } : {}),
  }
}

/** The guards of one side, as they are stored: a name, a judge, or the record of a guard of the engine's own. */
const guardsOf = (value: unknown): GuardOf[] =>
  (Array.isArray(value) ? value : []).map((one): GuardOf => {
    if (isStored(one) && typeof one.ours === 'string') return { name: one.ours, ours: true }
    if (isStored(one) && isStored(one.judge)) {
      const judge = judgeOf(one.judge)
      return { name: judge.model, judge }
    }
    return { name: String(one) }
  })

/** How long a person is waited for, as the timeout of a wait for them takes it: `limits.ask` in whole seconds. */
export const askTimeOf = (agent: AgentOf): string => `${Math.ceil(agent.limits.ask / 1000)} seconds`

/** The table of facts that `knows` names, where it names one. */
function factsOf(knows: unknown): { facts?: string } {
  const named = (Array.isArray(knows) ? knows : []).find((one) => isStored(one) && typeof one.facts === 'string')
  const table: unknown = Reflect.get(Object(named), 'facts')
  return typeof table === 'string' ? { facts: table } : {}
}

/** The units of a record, each with its most. */
const unitsOf = (value: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(isStored(value) ? value : {}).filter((one): one is [string, number] => typeof one[1] === 'number'),
  )

/**
 * Takes the name of an agent, its flow record, and what the program that started the run gave it. Answers what
 * the driver reads of it, with the defaults of the description format. Limits that the program gave
 * make the agent's smaller and never larger: of each the smaller holds, and of `perRun` each unit that either
 * names, the smaller where both do.
 */
export function agentOf(name: string, record: object, given?: object): AgentOf {
  const flow: Record<string, unknown> = Object(record)
  const own: Record<string, unknown> = isStored(flow.agent) ? flow.agent : {}
  const limits: Record<string, unknown> = isStored(own.limits) ? own.limits : {}
  const narrowed: Record<string, unknown> = isStored(Reflect.get(Object(given), 'limits'))
    ? Object(Reflect.get(Object(given), 'limits'))
    : {}
  const smaller = (stated: number, other: unknown): number =>
    typeof other === 'number' ? Math.min(stated, other) : stated
  const perRun = unitsOf(limits.perRun)
  for (const [unit, most] of Object.entries(unitsOf(narrowed.perRun)))
    perRun[unit] = unit in perRun ? Math.min(perRun[unit], most) : most
  const tools = (Array.isArray(own.tools) ? own.tools : []).map((entry): ToolEntry => {
    if (!isStored(entry)) return { tool: String(entry), told: String(entry) }
    const tool = String(entry.tool)
    return {
      tool,
      told: typeof entry.name === 'string' ? entry.name : tool,
      ...(typeof entry.about === 'string' ? { about: entry.about } : {}),
      ...(entry.line === false ? { line: false as const } : {}),
      ...(typeof entry.tries === 'number' ? { tries: entry.tries } : {}),
    }
  })
  const memory: Record<string, unknown> | undefined = isStored(own.memory) ? own.memory : undefined
  const keep = numberOf(memory?.keep, 10)
  const shrink: unknown = memory?.shrink
  const voice: Record<string, unknown> | undefined = isStored(own.voice) ? own.voice : undefined
  const reasoning: Record<string, unknown> = isStored(own.reasoning) ? own.reasoning : {}
  const guards: Record<string, unknown> = isStored(own.guards) ? own.guards : {}
  return {
    name,
    model: String(own.model),
    instructions: typeof own.instructions === 'string' ? own.instructions : '',
    tools,
    limits: {
      // With no `steps` stated, no number of calls to the model ends a run: how far a run goes is the builder's.
      steps: smaller(numberOf(limits.steps, Number.POSITIVE_INFINITY), narrowed.steps),
      perRun,
      time: smaller(numberOf(limits.time, 600_000), narrowed.time),
      ask: numberOf(limits.ask, 604_800_000),
      result: numberOf(limits.result, 1_048_576),
      toolCalls: numberOf(limits.toolCalls, 100),
      toolsAtOnce: numberOf(limits.toolsAtOnce, 8),
      pass: numberOf(limits.pass, 5000),
    },
    ...(memory
      ? {
          memory: {
            in: String(memory.in),
            thread: typeof memory.thread === 'string' ? memory.thread : 'thread',
            keep,
            after: numberOf(memory.after, keep),
            shrink:
              shrink === 'drop' || shrink === 'summary'
                ? shrink
                : isStored(shrink) && typeof shrink.function === 'string'
                  ? { function: shrink.function }
                  : isStored(shrink) && typeof shrink.flow === 'string'
                    ? { flow: shrink.flow }
                    : isStored(shrink) && typeof shrink.nearest === 'number'
                      ? { nearest: shrink.nearest }
                      : 'all',
            ...(typeof memory.model === 'string' ? { model: memory.model } : {}),
            ...(typeof memory.of === 'string' ? { of: memory.of } : {}),
            ...(typeof memory.recall === 'number' ? { recall: memory.recall } : {}),
          },
        }
      : {}),
    knows: (Array.isArray(own.knows) ? own.knows : []).filter(
      (one): one is 'caller' | 'time' => one === 'caller' || one === 'time',
    ),
    ...factsOf(own.knows),
    reasoning: {
      ...(reasoning.show === true ? { show: true as const } : {}),
      ...(reasoning.save === true ? { save: true as const } : {}),
    },
    tell: own.tell === 'list' ? 'list' : 'tools',
    sequence: own.sequence === true,
    trust: Array.isArray(own.trust) ? own.trust.map(String) : [],
    words: Object.fromEntries(
      Object.entries(isStored(own.words) ? own.words : {}).map(([key, value]) => [key, String(value)]),
    ),
    ...(voice
      ? {
          voice: {
            hear: String(voice.hear),
            speak: String(voice.speak),
            ...(typeof voice.name === 'string' ? { name: voice.name } : {}),
            ...(typeof voice.language === 'string' ? { language: voice.language } : {}),
            ...(voice.whole === true ? { whole: true as const } : {}),
          },
        }
      : {}),
    ...(typeof own.driver === 'string' ? { driver: own.driver } : {}),
    ...(isType(own.output) ? { output: own.output } : {}),
    guards: {
      in: guardsOf(guards.in),
      out: guardsOf(guards.out),
      ...(typeof guards.refused === 'string' ? { refused: guards.refused } : {}),
    },
    handsOver: Array.isArray(own.handsOver) ? own.handsOver.map(String) : [],
    questions: own.questions === true,
    ...(isStored(own.score) && isStored(own.score.with)
      ? { score: { share: numberOf(own.score.share, 0), with: judgeOf(own.score.with) } }
      : {}),
  }
}
