import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { isStored, startTypes, projectZone } from '../../core/internal.ts'
import { checkedInput } from '../door/input.ts'
import type { Opened } from '../opened.ts'
import { checkFiles } from '../stored/given.ts'
import { mayOpen } from './memory.ts'
import { flowLetsIn } from '../flows/allowed.ts'

/** The record of an agent of a flow record, or nothing for a flow that is none. */
export const agentRecordOf = (record: Record<string, unknown>): Record<string, unknown> | undefined =>
  isStored(record.agent) ? record.agent : undefined

/**
 * Takes an app, the name of an agent, its flow record, what a start was handed, the caller it starts for, and
 * whether its own `access` is held too. Checks the start as one from code and from a program is checked, which the
 * door does too, after its own rule: the types of a start (T0002), a message or a recording (T0002), a
 * conversation only where the agent has memory (T0002), and one the caller may open (T2103), files the caller
 * may download (T2104), and a voice for `audio` and `speak` (T7105). With `access`, its rule too, which the system
 * passes. Answers the input of the run.
 */
export function agentInput(
  o: Opened,
  name: string,
  record: Record<string, unknown>,
  given: unknown,
  caller: Caller,
  held: { access?: true } = {},
): Record<string, unknown> {
  const own = agentRecordOf(record) ?? {}
  const zone = projectZone(o.description.project)
  const input = checkedInput(name, startTypes, given ?? {}, { now: new Date(o.clock.now()), zone, caller })
  // The rule is asked of the checked start, as the rule of a function is of its checked input.
  if (held.access && own.access !== undefined) flowLetsIn(o, name, own.access, input, caller)
  if (typeof input.message !== 'string' && input.audio === undefined)
    throw new TentError('T0002', `A start of ${name} holds neither a message nor a recording.`, {
      fields: { message: 'required' },
      fix: 'Hand the agent `message`, or `audio`.',
    })
  if (input.thread !== undefined && !isStored(own.memory))
    throw new TentError('T0002', `The agent ${name} keeps no conversation, and was handed \`thread\`.`, {
      fields: { thread: 'unknown' },
      fix: 'Leave `thread` out, or give the agent a `memory`.',
    })
  if ((input.audio !== undefined || input.speak === true) && !isStored(own.voice))
    throw new TentError(
      'T7105',
      `The agent ${name} has no voice, and was handed ${input.audio === undefined ? '`speak`' : '`audio`'}.`,
      {
        fix: 'Give the agent a `voice`, or send it text.',
      },
    )
  checkFiles(o, name, startTypes, input, caller)
  if (typeof input.thread === 'string' && isStored(own.memory)) {
    const memory = own.memory
    const thread = typeof memory.thread === 'string' ? memory.thread : 'thread'
    const table = String(memory.in)
    const stored = Object.hasOwn(o.description.tables, table) ? o.description.tables[table] : undefined
    const linked: unknown = Reflect.get(Object(Reflect.get(Object(stored?.columns), thread)), 'table')
    mayOpen(o, { ...(typeof linked === 'string' ? { linked } : {}) }, input.thread, caller)
  }
  return input
}

/**
 * Takes a flow record and the input of its run. Answers what the runner settles of a conversation: the thread the
 * run adds to, where the agent has memory, and what happens to a start over it: `together.then`, which is
 * `'refuse'` for a conversation where it is left out.
 */
export function threadOf(
  record: Record<string, unknown>,
  input: unknown,
): { thread?: string; then?: 'refuse' | 'wait' | 'stop' } {
  const own = agentRecordOf(record)
  const thread: unknown = Reflect.get(Object(input), 'thread')
  if (!own || !isStored(own.memory) || typeof thread !== 'string') return {}
  const together: unknown = record.together ?? own.together
  const then: unknown = Reflect.get(Object(together), 'then')
  return { thread, then: then === 'wait' || then === 'stop' ? then : 'refuse' }
}
