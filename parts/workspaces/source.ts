import type { Caller } from '../core/index.ts'
import { object, TentError } from '../core/index.ts'
import type { ToolSource, ToolSpec } from '../core/internal.ts'
import { checkValue } from '../core/internal.ts'
import type { Writer } from '../history/index.ts'
import type { Policy } from './policy.ts'
import { policyOf, toolsOf } from './policy.ts'
import type { Held, One } from './state.ts'
import { oneOf } from './state.ts'
import { projectTools } from './tools/all.ts'
import type { Form, ToolAt } from './tools/face.ts'
import { trustedOwner } from './opening.ts'

/** The error of a tool that a policy does not offer: it is no tool, as a model is told of any it was not offered. */
const noTool = (name: string): TentError =>
  new TentError('T0001', `No project tool ${JSON.stringify(name).slice(0, 60)} is offered to this agent.`, {
    fix: 'Use a tool that the policy of the agent names in `tools`, in a mode that lets it.',
  })

/** The workspace that the context of a run of the source names: the one the program gave, and no other. */
const workspaceOf = (context: unknown): string => String(Reflect.get(Object(context), 'workspace') ?? '')

/**
 * Where a tool reads the project of a workspace: in the host for an owner that `trusted` names, and in the box
 * otherwise, so nothing a model wrote runs in the program of the product.
 */
async function formOf(held: Held, one: One): Promise<Form> {
  return (await trustedOwner(held, one)) ? 'host' : 'box'
}

// The tools whose write waits for the person where `ask` names them, as `writeHeld` holds it.
const askedOnWrite = new Set(['edit', 'write', 'rename', 'remove'])

/** The names that the agent's `trust` lists. */
const trustOf = (record: object): string[] => {
  const trust: unknown = Reflect.get(Object(Reflect.get(record, 'agent')), 'trust')
  return Array.isArray(trust) ? trust.map(String) : []
}

/** The policy of an agent's record, and the tools it offers: none for an agent with no policy. */
function offered(record: object): { policy?: Policy; names: string[] } {
  const policy = policyOf(record)
  return policy ? { policy, names: toolsOf(policy).filter((name) => projectTools.has(name)) } : { names: [] }
}

/**
 * Takes what the workspaces hold, the id of a workspace, the name of a tool and its input, and where it is
 * carried out: the caller, the record of the agent whose policy holds, what writes its points, and what asks
 * the person. Carries the tool out on that workspace, under that policy. Throws T0001 for a tool the policy does
 * not offer, T0002 for an input that does not fit, and what the tool throws.
 */
export async function toolCalled(
  held: Held,
  id: string,
  name: string,
  input: unknown,
  o: { caller: Caller; record: object; by: Writer; ask(what: object): Promise<boolean> },
): Promise<unknown> {
  const { policy, names } = offered(o.record)
  const tool = projectTools.get(name)
  if (!policy || !tool || !names.includes(name)) throw noTool(name)
  const missed = checkValue(object(tool.input), input ?? {})
  if (missed.length)
    throw new TentError('T0002', `The input of ${name} does not fit: ${missed.map((one) => one.message).join(' ')}`, {
      fields: Object.fromEntries(missed.flatMap((one) => Object.entries(one.fields ?? {}))),
    })
  const one = oneOf(held, id)
  const at: ToolAt = {
    held,
    one,
    policy,
    form: await formOf(held, one),
    caller: o.caller,
    by: o.by,
    trust: trustOf(o.record),
    async ask(what) {
      if (!(await o.ask(what))) throw new TentError('T7111', 'The person refused this.')
    },
  }
  // A tool that `ask` names waits for the person first; one that writes files asks once its write is read, with
  // nothing written meanwhile.
  if (policy.ask.includes(name) && !askedOnWrite.has(name)) await at.ask({ tool: name, input: input ?? {} })
  if (!tool.writes) return tool.run(at, Object(input ?? {}))
  // A model may ask for several tools in one step, which are carried out together: two that write one file would
  // each read it before the other wrote, and the second would write over the first.
  const done = (one.writing ?? Promise.resolve()).then(() => tool.run(at, Object(input ?? {})))
  one.writing = done.catch(() => undefined)
  return done
}

/**
 * The source `project` of the workspaces: the project tools of one workspace, which a run is given by a program
 * that starts it with `{ name: 'project', context: { workspace } }`. Its tools are those the policy of the
 * agent names, less what its mode takes away; each is carried out on the workspace of the context, which no
 * caller can set, and no input of a tool names another.
 */
export function projectSource(held: Held): ToolSource {
  return {
    tools({ record }): ToolSpec[] {
      return offered(record).names.flatMap((name) => {
        const tool = projectTools.get(name)
        // No tool sends by itself: `run` asks the person where what it calls sends, with the ask it is handed.
        return tool ? [{ name: tool.name, about: tool.about, input: tool.input, sends: false }] : []
      })
    },
    call: ({ starter, record, context, tool, input, ask }) =>
      toolCalled(held, workspaceOf(context), tool, input, { caller: starter, record, by: { kind: 'ai' }, ask }),
  }
}
