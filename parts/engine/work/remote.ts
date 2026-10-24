import type { Opened } from '../opened.ts'

/** What work on a worker asks of its writer: each crosses the link as a `call` that names the task, and is answered there. */
export interface Remote {
  // A function, a flow, an agent, a model call or a service call that the work calls from code; with `start`, a flow it starts.
  call(name: string, input: unknown): Promise<unknown>
  start(flow: string, input: unknown): Promise<unknown>
  // A member of a handle, as the caller of the task.
  handle(name: string): object
  // A plan in its stored form, carried out as the caller of the task.
  read(plan: unknown): Promise<unknown>
  // The bytes of a file that the caller of the task may download, and a file that the work made, posted by its bytes.
  bytes?(id: string): Promise<Uint8Array>
  post?(bytes: Uint8Array, kind?: string): Promise<string>
  // A message of its own to the writer: the `may` before an outside call that the worker makes, and its `did`.
  ask(message: Record<string, unknown>): Promise<unknown>
  // The sorts of outside calls that the writer makes for the work of this kind, which `outside` of the kind names.
  outside: { services: boolean; models: boolean; fetch: boolean }
}

/**
 * Takes what sends one call of a task to the writer, naming that task, and answers its answer, and the `log` of
 * its work where the worker gathers one, and how it reaches the bytes of files. Answers what the work of that task
 * is handed to reach the writer.
 */
export function remoteOf(
  asked: (message: Record<string, unknown>) => Promise<unknown>,
  log?: object,
  outside: { services: boolean; models: boolean; fetch: boolean } = { services: false, models: false, fetch: false },
  files?: Pick<Remote, 'bytes' | 'post'>,
): Remote {
  return {
    ...files,
    ask: asked,
    outside,
    call: (name, input) => asked({ what: 'do', name, input }),
    start: (flow, input) => asked({ what: 'do', name: flow, input, start: true }),
    read: (plan) => asked({ what: 'read', plan }),
    // The `log` of the work is gathered by the worker and sent as `log`, and is no call of the writer.
    handle: (name) =>
      name === 'log' && log
        ? log
        : new Proxy(
            {},
            {
              get: (_, member) =>
                typeof member === 'string'
                  ? (...args: unknown[]) => asked({ what: 'handle', handle: name, member, args })
                  : undefined,
            },
          ),
  }
}

/** The sorts of outside calls that the writer makes for the work of a kind, by `outside` of the kind. */
export function outsideOf(served: Opened, kind: string): { services: boolean; models: boolean; fetch: boolean } {
  const workers: unknown = served.description.project.workers
  const stated: unknown = Reflect.get(Object(Reflect.get(Object(workers), kind)), 'outside')
  const byWriter = (sort: string): boolean => stated === 'writer' || Reflect.get(Object(stated), sort) === 'writer'
  return { services: byWriter('services'), models: byWriter('models'), fetch: byWriter('fetch') }
}
