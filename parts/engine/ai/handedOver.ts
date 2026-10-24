import type { Opened } from '../opened.ts'
import { agentRecordOf } from './started.ts'

/**
 * Takes an app, the name of an agent that a start names, its flow record, and what the start was handed.
 * Answers the agent that answers it: on a conversation that this agent handed over, the one that holds it
 * now, as the engine keeps it with the conversation; and else the agent itself.
 */
export function holderOf(
  o: Opened,
  name: string,
  record: Record<string, unknown>,
  given: unknown,
): { name: string; record: Record<string, unknown> } {
  const thread: unknown = Reflect.get(Object(given), 'thread')
  if (agentRecordOf(record)?.memory === undefined || typeof thread !== 'string') return { name, record }
  const held = o.flows?.runner.heldBy(thread)
  // Only a start of an agent that handed this conversation over goes on to the one that holds it.
  if (!held || held.agent === name || !held.from.includes(name)) return { name, record }
  const holder = Object.hasOwn(o.description.flows, held.agent) ? o.description.flows[held.agent] : undefined
  return holder && agentRecordOf(holder) ? { name: held.agent, record: holder } : { name, record }
}
