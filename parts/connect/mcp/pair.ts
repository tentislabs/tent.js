import type { Caller } from '../../core/index.ts'
import { json, number, object, TentError, text } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { toJsonSchema } from '../../core/internal.ts'
import { callInput } from '../callInput.ts'
import type { Listed } from './listed.ts'
import { twoLinesOf } from './listed.ts'
import type { Offered } from './offered.ts'
import { forFrame, listedTo, mcpOf } from './offered.ts'

/** The two tools that stand in the place of the list above `toolsListed`. */
export const pair = { find: 'findFunction', call: 'callFunction' }

const findFields = { words: text(), after: text({ optional: true }), limit: number({ optional: true }) }
const callFields = { name: text(), input: json({ optional: true }) }

/** `toolsListed` of the project: how many tools a caller is listed before the pair stands in their place. */
export const toolsListedOf = (description: Description): number => {
  const stated = mcpOf(description).toolsListed
  return typeof stated === 'number' ? stated : 20
}

/**
 * The pair of tools, as the list holds them. `callFunction` is marked as not reading only and as destructive, and
 * as reading only for a caller who may only read.
 */
export function pairListed(readsOnly: boolean): Listed[] {
  return [
    {
      name: pair.find,
      title: 'Find function',
      description:
        'Finds the functions of the app whose name or description holds every one of the words, twenty at a time, each with its input.',
      inputSchema: toJsonSchema(object(findFields)),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: pair.call,
      title: 'Call function',
      description: 'Calls one function of the app, by the name that findFunction answered, with its input.',
      inputSchema: toJsonSchema(object(callFields)),
      annotations: readsOnly
        ? { readOnlyHint: true, openWorldHint: false }
        : { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
  ]
}

/**
 * `findFunction`: the functions this caller would be listed whose name or `about` holds every one of the words,
 * in any capitals, in the order of their names, from the one after `after`, `limit` at a time, each as its name
 * and its two lines of the list, with a mark when there are more. Throws T0002 for an input that does not fit.
 */
export function found(description: Description, caller: Caller, input: unknown): Record<string, unknown> {
  const asked = callInput(pair.find, findFields, input)
  const words = String(asked.words).toLowerCase().split(/\s+/).filter(Boolean)
  const after = typeof asked.after === 'string' ? asked.after : undefined
  const limit = typeof asked.limit === 'number' && asked.limit > 0 ? Math.floor(asked.limit) : 20
  const holds = (one: Offered): boolean => {
    const said = `${one.tool} ${typeof one.record.about === 'string' ? one.record.about : ''}`.toLowerCase()
    return words.every((word) => said.includes(word))
  }
  // What the frame alone calls is no function of the model's, and is not found for it.
  const all = listedTo(description, caller).filter(
    (one) => !forFrame(description, one) && holds(one) && (after === undefined || one.tool > after),
  )
  return {
    functions: all.slice(0, limit).map((one) => ({ name: one.tool, lines: twoLinesOf(description, one) })),
    more: all.length > limit,
  }
}

/** What `callFunction` was handed: the name of the tool to call and its input. Throws T0002 where it does not fit. */
export function callOf(input: unknown): { name: string; input: unknown } {
  const asked = callInput(pair.call, callFields, input)
  return { name: String(asked.name), input: asked.input ?? {} }
}

/**
 * Takes a description, the offered function that `callFunction` names and the input it was handed. Throws T0002
 * where the input does not fit, as the `call` of an agent does: what does not fit, and the two lines of the
 * function in the list.
 */
export function fitsCalled(description: Description, one: Offered, input: unknown): void {
  // An agent takes its message alone, which its own call checks.
  if (one.kind === 'agent') return
  try {
    callInput(one.tool, one.record.input, input)
  } catch (error) {
    if (!(error instanceof TentError)) throw error
    throw new TentError('T0002', `${error.message}\n${twoLinesOf(description, one)}`, {
      ...(error.fields ? { fields: error.fields } : {}),
      ...(error.fix ? { fix: error.fix } : {}),
    })
  }
}
