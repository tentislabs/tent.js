import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import type { McpEnv } from './env.ts'
import type { Offered } from './offered.ts'
import { moreIsNeeded, questionOf, questionRequest } from './question.ts'
import type { McpRequest } from './reading.ts'
import { accepted, methods, newest } from './standard.ts'

/** What a call of a tool came to: the value of its function, or the answer that more is needed of the client. */
export type Called = { value: unknown } | { more: Record<string, unknown> }

/** The door's text of a T7120: the call asks a person, and the same call comes back with it after a yes. */
function askText(error: unknown): string | undefined {
  if (!(error instanceof TentError) || error.code !== 'T7120') return undefined
  const text = error.fields?.ask
  return typeof text === 'string' ? text : undefined
}

/**
 * Where a client cannot be asked, the ask of a run that a call waited for is T0008 with the run and the page of
 * the ask: the run goes on, and the same tool with `{ run }` waits for it again once the person answered there.
 */
function waitsOn(error: unknown): unknown {
  const fields = error instanceof TentError ? error.fields : undefined
  if (!fields?.run) return error
  return new TentError('T0008', `The run ${fields.run} waits for the person's answer, and goes on.`, {
    fields: { run: fields.run, ...(fields.page ? { page: fields.page } : {}) },
    fix: 'Let the person say yes or no at `page`, and call the tool again with `{ run }` alone.',
  })
}

/**
 * Calls the function of a tool through the door, asking the person where it states `danger: 'ask'`, or where the
 * run it waits for asks: a client of the newest form that says it can ask is answered that more is needed, with
 * the question and the text of the engine, and the call that comes back with the answer and that text agrees or
 * refuses; a client of an older form is asked down its kept stream, where the project keeps one. Any other is
 * refused with the T7120 of the door, or T0008 with the page of the ask of a run.
 */
export async function calledAsking(
  env: McpEnv,
  o: { one: Offered; input: unknown; caller: Caller; params: Record<string, unknown>; read: McpRequest },
): Promise<Called> {
  const { one, input, caller, params, read } = o
  const answer = isStored(params.inputResponses) ? params.inputResponses.ask : undefined
  const state = typeof params.requestState === 'string' ? params.requestState : undefined
  if (answer !== undefined && state !== undefined) {
    const refused = Reflect.get(Object(answer), 'action') !== accepted
    return { value: await env.call(one.name, input, caller, { agreed: state, ...(refused ? { refused } : {}) }) }
  }
  try {
    return { value: await env.call(one.name, input, caller) }
  } catch (error) {
    const text = askText(error)
    if (text === undefined) throw error
    const message = questionOf(env, one, input, error instanceof TentError ? error.fields : undefined)
    if (read.version === newest && isStored(read.can.elicitation)) return { more: moreIsNeeded(message, text) }
    const said =
      read.version === newest
        ? undefined
        : await env.askOver?.(caller, methods.question, questionRequest(message).params)
    if (said === undefined) throw waitsOn(error)
    const refused = Reflect.get(Object(said), 'action') !== accepted
    return { value: await env.call(one.name, input, caller, { agreed: text, ...(refused ? { refused } : {}) }) }
  }
}
