import type { Caller, Functions } from '../core/index.ts'
import { needsUsers, userCaller } from '../core/internal.ts'
import type { App } from '../engine/index.ts'
import { toldCall } from './told.ts'

/** Whom a test names as a caller: a caller, the id of a user, or one of the two that have a word. */
export type TestCaller = Caller | string

/** A function as a test names it: by its name, or by its definition. */
export type Fn = string | { readonly definition: string }

/** Holds an app to having a table of users. Throws T0014 for one that has none. */
export const withUsers = (app: App): void =>
  needsUsers({ name: app.description.app.name, tables: app.description.tables })

/**
 * Takes an app, and whom a test named. Answers the caller: a caller as it is, nobody and the system by their
 * words, and for the id of a user the caller that its row makes. Throws T0014 where an id is named and the app
 * has no `users` table, and T2103 for an id that names no row.
 */
export async function callerOf(app: App, named: TestCaller): Promise<Caller> {
  if (typeof named !== 'string') return named
  if (named === 'nobody' || named === 'system') return { kind: named }
  withUsers(app)
  return userCaller(named, await app.read({ from: 'users', one: 'get', id: named }, { as: 'system' }))
}

/**
 * `app.as(caller)`: answers what calls a function as that caller, through steps 5 to 10 of the door. The promise
 * of a call is refused with the `TentError` of its failure, and answers once `landed` has answered.
 */
export const as =
  (app: App, landed: () => Promise<void> = async () => undefined) =>
  (caller: TestCaller): Asked => {
    // One call, which the types of `Asked` say three things of: what it answers by a definition, by a name of the
    // type list, and by any other name.
    function call<What extends { readonly definition: string }>(fn: What, input?: unknown): Promise<AnswerOf<What>>
    function call<Name extends FunctionName>(fn: Name, input?: unknown): Promise<AnswerOf<Functions[Name]>>
    function call(fn: Fn, input?: unknown): Promise<unknown>
    async function call(fn: Fn, input: unknown = {}): Promise<unknown> {
      // Where the test made the call, while its code is still on the stack: a refusal is made far from it.
      const madeAt = new Error().stack?.split('\n').slice(1).join('\n') ?? ''
      const as = await callerOf(app, caller)
      const done = await app.called(() => app.call(fn, input, { as }))
      const told = toldCall(typeof fn === 'string' ? fn : fn.definition, as, input, done)
      // A refusal carries the facts of its call, as fields of its own, beside its code, and the place of the call.
      if ('error' in done) {
        const refused = Object.assign(Object(done.error), { trace: done.trace, call: told })
        if (typeof refused.stack === 'string') refused.stack = `${refused.stack}\n${madeAt}`
        throw refused
      }
      // The call answers once the pages that the test opened hold what it wrote.
      await landed()
      return done.value
    }
    return { call, page: async (path) => app.page(path, { as: await callerOf(app, caller) }) }
  }

/** What a call of a definition answers, as code holds it: what the definition itself says it answers. */
type AnswerOf<What> = What extends (...input: never[]) => infer Answer ? Awaited<Answer> : unknown

/** The names of the functions of the project, which its type list holds. */
type FunctionName = Extract<keyof Functions, string>

/** What a test does as one caller: a call of a function, and a request for a screen. */
export interface Asked {
  /** Calls a function by its definition: the answer has the type that the definition says it answers. */
  call<What extends { readonly definition: string }>(fn: What, input?: unknown): Promise<AnswerOf<What>>
  /** Calls a function by its name: where the type list of the project holds the name, the answer is typed by it. */
  call<Name extends FunctionName>(fn: Name, input?: unknown): Promise<AnswerOf<Functions[Name]>>
  call(fn: Fn, input?: unknown): Promise<unknown>
  /** What a request for that address answers: its status, its headers and its HTML. */
  page(path: string): Promise<{ status: number; headers: Record<string, string>; html: string }>
}
