import type { TestContext } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { Provider, ReplyPart, ReplyRequest } from '../index.ts'
import { ProviderFailure } from '../index.ts'
import type { Running } from './apps.ts'
import { addUser, running } from './apps.ts'
import { cookieOf, watcher } from './watching.ts'

/** What the model of a test answers: its reasoning, a text in parts, the tools it asks for, a typed value; or a failure. */
export interface Said {
  reasoning?: string[]
  text?: string
  parts?: string[]
  calls?: { tool: string; input: unknown }[]
  value?: unknown
  // The first model fails after its reasoning, so that the call goes to the second.
  failAfterReasoning?: true
  // What the model waits for after the first part of its text.
  hold?: Promise<void>
}

/** What a test has the model answer each request with: it is told which model was asked. */
type Script = (request: ReplyRequest, model: string) => Said | Promise<Said>

/** The project of followed runs, opened, with two users and what the model answers. */
export interface Followed extends Running {
  maya: Caller
  leo: Caller
  say(script: Script): void
  asked: ReplyRequest[]
}

// What lets each gate go, so that a test that ends lets every step go before its app closes.
const opened = new Set<() => void>()

/** Holds the steps that wait at a gate of that name until the answer is called. */
export function gateOf(name: string): () => void {
  const key = Symbol.for('tentjs.test.followed')
  const held: unknown = Reflect.get(globalThis, key)
  const gates: Map<string, Promise<void>> = held instanceof Map ? held : new Map()
  Reflect.set(globalThis, key, gates)
  let go = (): void => undefined
  gates.set(name, new Promise<void>((done) => (go = done)))
  const open = (): void => {
    gates.delete(name)
    opened.delete(open)
    go()
  }
  opened.add(open)
  return open
}

/** Has a step of that name fail once, when it next ends. */
export function failOnce(name: string): void {
  const key = Symbol.for('tentjs.test.followed.fail')
  const held: unknown = Reflect.get(globalThis, key)
  const names: Set<string> = held instanceof Set ? held : new Set()
  Reflect.set(globalThis, key, names.add(name))
}

/** Lets every gate go. */
export function letAllGo(): void {
  for (const open of [...opened]) open()
}

/** A model of the tests, which answers as the script it is set to says, and keeps what it was sent. */
export function scripted(): { mine: Provider; asked: ReplyRequest[]; say(script: Script): void } {
  let script: Script = () => ({ text: 'Fine.' })
  const asked: ReplyRequest[] = []
  const mine: Provider = {
    async *reply(o): AsyncGenerator<ReplyPart> {
      asked.push(o)
      const model = String(o.model.name)
      const said = await script(o, model)
      for (const reasoning of said.reasoning ?? []) yield { reasoning }
      if (said.failAfterReasoning && model === 'm-1') throw new ProviderFailure('server', 'The first model fails.')
      const text = said.value === undefined ? (said.text ?? (said.parts ?? []).join('')) : JSON.stringify(said.value)
      const pieces =
        said.value !== undefined ? [text.slice(0, 5), text.slice(5)] : (said.parts ?? (said.text ? [said.text] : []))
      // What the model waits for comes after the first part of its text, so that a test sees it at work.
      for (const [i, piece] of pieces.entries()) {
        yield { text: piece }
        if (i === 0) await said.hold
      }
      if (!pieces.length) await said.hold
      yield {
        end: {
          text,
          calls: (said.calls ?? []).map((one, i) => ({ id: `c${asked.length}.${i}`, ...one })),
          ...(said.value === undefined ? {} : { value: said.value }),
        },
      }
    },
  }
  return {
    mine,
    asked,
    say: (next) => {
      script = next
    },
  }
}

/** Opens the project of followed runs, with a model of the test's own and two users. */
export async function followedApp(t: TestContext): Promise<Followed> {
  const { mine, asked, say } = scripted()
  // Every gate is let go before the app closes: a step that waits at one would hold the closing back.
  t.after(letAllGo)
  const run = await running(t, { project: 'followed', engine: { makers: { providers: () => ({ mine }) } } })
  const maya = await addUser(run.app, 'Maya')
  const leo = await addUser(run.app, 'Leo')
  return {
    ...run,
    maya,
    leo,
    asked,
    say,
  }
}

/** The live connection of a user, as a page of theirs holds it. */
export async function liveOf(h: Followed, who: Caller) {
  const id = String(who.user?.id)
  return watcher(h.app, h.origin, { cookie: cookieOf(h.app, id), as: id })
}
