import type { TestContext } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { Provider, ReplyRequest } from '../index.ts'
import type { Running } from './apps.ts'
import { addUser, running } from './apps.ts'

/** What the model of a test answers: a text, the tools it asks for, or both. */
interface Said {
  text?: string
  calls?: { tool: string; input: unknown }[]
  // The text in parts, with a wait after each but the last: so a test sees an answer while it is written.
  parts?: { text: string; then?: Promise<void> }[]
}

/** What a test has the model answer each request with. */
export type Script = (request: ReplyRequest) => Said | Promise<Said>

/** The project of the agents at work, opened, with two users and what the model answers. */
export interface Helped extends Running {
  maya: Caller
  leo: Caller
  /** Has the model answer from now on as the script says. */
  say(script: Script): void
  /** Every request the model was sent so far. */
  asked: ReplyRequest[]
}

/** Opens the project of the agents at work, with a model of the test's own and two users. */
export async function helped(t: TestContext): Promise<Helped> {
  let script: Script = () => ({ text: 'Fine.' })
  const asked: ReplyRequest[] = []
  const mine: Provider = {
    async *reply(o) {
      asked.push(o)
      const said = await script(o)
      for (const part of said.parts ?? []) {
        yield { text: part.text }
        await part.then
      }
      if (said.text) yield { text: said.text }
      yield {
        end: {
          text: said.text ?? (said.parts ?? []).map((part) => part.text).join(''),
          calls: (said.calls ?? []).map((one, i) => ({ id: `c${asked.length}.${i}`, ...one })),
        },
      }
    },
  }
  // Mail goes nowhere: a test counts what was sent.
  const mailer = { send: async () => ({}) }
  const run = await running(t, {
    project: 'helped',
    engine: { makers: { providers: () => ({ mine }), mailer: () => mailer } },
  })
  const maya = await addUser(run.app, 'Maya')
  const leo = await addUser(run.app, 'Leo')
  return {
    ...run,
    maya,
    leo,
    asked,
    say: (next) => {
      script = next
    },
  }
}

/** Has the model ask for one tool when a person spoke last, and else answer what the tools answered. */
export const oneTool =
  (tool: string, input: unknown = {}): Script =>
  (request) => {
    const last = request.messages.at(-1)
    if (last?.who === 'user') return { calls: [{ tool, input }] }
    return { text: JSON.stringify(last?.error ?? last?.result ?? null) }
  }
