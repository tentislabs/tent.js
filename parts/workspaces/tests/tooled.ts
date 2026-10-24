import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { Provider, ReplyRequest } from '../../engine/index.ts'
import type { Workspace } from '../index.ts'
import type { Held } from './held.ts'
import { folderOf, held, product, templates } from './held.ts'

/** The templates of these tests, with the one of the project tools: notes, letters and an action that sends. */
export const toolTemplates = { ...templates, notes: join(import.meta.dirname, 'notes') }

/** One answer of the scripted model: its text, and the tools it asks for, each with its input. */
export interface Scripted {
  text?: string
  calls?: { tool: string; with?: unknown }[]
  tokensOut?: number
}

/** A model of these tests that answers what a script says, and keeps what it was sent. */
export interface ScriptedModel {
  provider: Provider
  sent: ReplyRequest[]
}

/**
 * Takes what the model answers: one answer for each call of it in order, or a function of the request. Answers a
 * provider that a test puts in place of the product's model with `standIn`, and what it was sent. Each answer
 * reports what it used, so the budget of a run counts it.
 */
export function scripted(answers: Scripted[] | ((request: ReplyRequest, n: number) => Scripted)): ScriptedModel {
  const sent: ReplyRequest[] = []
  let calls = 0
  const provider: Provider = {
    async *reply(request) {
      sent.push(request)
      const n = sent.length - 1
      const answer = typeof answers === 'function' ? answers(request, n) : (answers[n] ?? { text: 'Done.' })
      const text = answer.text ?? ''
      if (text !== '') yield { text }
      yield {
        end: {
          text,
          calls: (answer.calls ?? []).map((call) => ({
            id: `call-${++calls}`,
            tool: call.tool,
            input: call.with ?? {},
          })),
          units: { tokensIn: 10, tokensOut: answer.tokensOut ?? 10 },
        },
      }
    },
  }
  return { provider, sent }
}

/** The workspaces of the builder product of these tests, with a workspace of an owner and the caller who owns it. */
export interface Tooled extends Held {
  owner: string
  caller: Caller
  made: Workspace
  // Carries one project tool out on the workspace, under the policy of an agent: `builder` where none is named.
  tool(name: string, input: object, agent?: string): Promise<unknown>
}

/** Makes the workspaces of the builder product, a user of it, and a workspace of that user from a template. */
export async function tooled(t: TestContext, from = 'notes'): Promise<Tooled> {
  const at = await held(t, { templates: toolTemplates }, await product(t, folderOf(t), 'builder'))
  const [row] = Object(
    await at.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: ['builder'] } }], { as: 'system' }),
  )
  const owner = String(Object(row).id)
  const caller: Caller = { kind: 'user', user: { id: owner, roles: [] } }
  const made = await at.workspaces.create({ owner, from })
  await at.workspaces.run(made.id)
  return {
    ...at,
    owner,
    caller,
    made,
    tool: (name, input, agent = 'builder') => at.workspaces.tool(made.id, name, input, { caller, agent }),
  }
}

/** What a promise was refused with, or nothing where it was kept. */
export const refusal = (
  done: Promise<unknown>,
): Promise<{ code?: string; message?: string; fields?: Record<string, string> } | undefined> =>
  done.then(
    () => undefined,
    (error: { code?: string; message?: string; fields?: Record<string, string> }) => error,
  )
