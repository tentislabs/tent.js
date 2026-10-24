import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Driver } from '../../flows/index.ts'
import type { AiEnv } from '../face.ts'
import type { AgentOf } from './agentOf.ts'
import type { StartOf } from './listed.ts'
import type { SourceTool } from './sources.ts'
import type { Offered } from './tools.ts'

/** The step tools of a run, as the runner hands them to a driver. */
type Steps = Parameters<Driver>[0]['step']

/**
 * A pool that lets so many pieces of work run at once, and the rest wait their turn. A piece that waits for pieces
 * of its own, as an `all` waits for its entries, gives its place up while it waits, and takes one again after.
 */
export interface Pool {
  <T>(work: () => Promise<T>): Promise<T>
  waiting<T>(work: () => Promise<T>): Promise<T>
}

/** What the driver of one run works with. */
export interface Running {
  env: AiEnv
  agent: AgentOf
  run: Parameters<Driver>[0]
  starter: Caller
  offered: Offered[]
  sources: SourceTool[]
  step: Steps
  // What the start of each model step is made of: the form, the tools, and whether a sequence is offered.
  told: StartOf
  // Whether the line after a long answer was handed in this run: it is handed once.
  eachOne: { told: boolean }
  // The tool calls of the run so far, those that sequences make among them, and the `fill` calls of its sequences.
  toolCalls: { n: number }
  fills: { n: number }
  // `toolsAtOnce` holds for the whole run: for the tools of one answer and for every `all` of its sequences.
  pool: Pool
  // The provider's own tools that the model steps of the run offer.
  hosted: string[]
  // The older messages that were recalled for this run, which each model step is sent.
  recalled: { who: string; text: string }[]
  // The older rows of the conversation nearest to the message, which are sent beside the latest turns.
  nearest: string[]
  // What the person said in this turn, which a judge that guards reads as the task.
  message: string
}

/** The error of a limit of a run that was reached, naming the limit and the unit. */
export const reached = (limit: string, unit: string, most: number): TentError =>
  new TentError('T7102', `The run reached its limit \`${limit}\` of ${most} ${unit}.`, {
    fields: { limit, unit },
    fix: `Raise \`limits.${limit}\` of the agent, or ask for less in one run.`,
  })

/** Takes how many pieces of work may run at once. Answers the pool that holds them to it. */
export function poolOf(most: number): Pool {
  let running = 0
  const queue: (() => void)[] = []
  const take = async (): Promise<void> => {
    while (running >= most) await new Promise<void>((turn) => queue.push(turn))
    running++
  }
  const give = (): void => {
    running--
    queue.shift()?.()
  }
  const pool = async <T>(work: () => Promise<T>): Promise<T> => {
    await take()
    try {
      return await work()
    } finally {
      give()
    }
  }
  const waiting = async <T>(work: () => Promise<T>): Promise<T> => {
    give()
    try {
      return await work()
    } finally {
      await take()
    }
  }
  return Object.assign(pool, { waiting })
}
