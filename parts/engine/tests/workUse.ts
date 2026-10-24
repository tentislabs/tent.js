import assert from 'node:assert/strict'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { Clock, Description } from '../../core/internal.ts'
import type { App, Frame, Provider, ReplyPart, Worker, Workers } from '../index.ts'
import { counts } from '../index.ts'
import { bundled, engineOf, testClock, workFolder } from './apps.ts'
import type { RawWorker } from './workLink.ts'
import { joiningKeys, rawWorker } from './workLink.ts'

/** One row of the counts, as a program reads it. */
export interface Count {
  day: string
  name: string
  answeredBy: string
  caller: string
  unit: string
  amount: number
}

/** A provider of the tests that answers every call with a few tokens. */
const answering: Provider = {
  async *reply(): AsyncGenerator<ReplyPart> {
    yield { text: 'Hello.' }
    yield { end: { text: 'Hello.', calls: [], units: { tokensIn: 4, tokensOut: 2 } } }
  },
}

/** Sets the limits of use of a kind of worker of the project. */
export const kindLimits =
  (kind: string, limits: object) =>
  (description: Description): void => {
    const workers: Record<string, Record<string, unknown>> = Object(description.project.workers)
    workers[kind] = { ...workers[kind], limits }
  }

/** Sets limits of a function of the project, beside those it states. */
export const ownLimits =
  (name: string, limits: object) =>
  (description: Description): void => {
    const fn = description.functions[name]
    fn.limits = { ...Object(fn.limits), ...limits }
  }

/** A writer of the project of machine time, on a clock that the test moves, which lets workers of `keys.free` join. */
export async function writerFor(
  t: TestContext,
  o: {
    change?: ((description: Description) => void)[]
    workers?: Workers
    provider?: Provider
    countEvery?: string
    start?: number
  } = {},
) {
  const { clock, advance } = testClock(o.start)
  const bundle = await bundled(t, {
    project: 'workUse',
    change: (description) => {
      for (const one of o.change ?? []) one(description)
    },
  })
  const host = o.workers
  const engine = engineOf(t, {
    makers: {
      clock: () => clock,
      providers: () => ({ mine: o.provider ?? answering }),
      ...(host ? { workers: () => host } : {}),
    },
  })
  const dataFolder = join(workFolder(t), 'data')
  const open = (): Promise<App> =>
    engine.open(bundle.folder, {
      dataFolder,
      mode: 'test',
      insecure: true,
      workers: [joiningKeys.free],
      // A worker of the test reaches the writer by a name of its own, which the writer answers on.
      address: '*',
      ...(o.countEvery ? { countEvery: o.countEvery } : {}),
    })
  let app = await open()
  return {
    app: () => app,
    engine,
    advance,
    clock,
    dataFolder,
    // Closes the writer and opens it again on the same data, as a program that was started again.
    async reopen(): Promise<App> {
      await app.close()
      app = await open()
      return app
    },
  }
}

/** Adds a user, and answers the caller that is that user. */
export async function person(app: App, name: string): Promise<Caller> {
  const [made] = Object(await app.write([{ add: 'users', values: { name, roles: [] } }], { as: 'system' }))
  return { kind: 'user', user: { id: String(made.id), roles: [] } }
}

/** A worker by hand of these kinds, with that many places, joined and, unless told otherwise, ready for every version. */
export async function worker(
  app: App,
  o: { kinds?: string[]; atOnce?: number; ready?: boolean; id?: string } = {},
): Promise<RawWorker> {
  const one = rawWorker(app, joiningKeys.free)
  one.send({
    t: 'here',
    id: o.id ?? '01m4x5y72ke6aay7szexb9d1dz',
    kinds: o.kinds ?? ['gpu'],
    atOnce: o.atOnce ?? 1,
    engine: '1.0.0',
    working: [],
    lost: [],
  })
  await one.next('go')
  const versions = await one.next('versions')
  if (o.ready !== false) readyFor(one, versions)
  return one
}

/** Says `ready` for every version that a `versions` message lists. */
export function readyFor(one: RawWorker, versions: Record<string, unknown>): void {
  for (const listed of Array.isArray(versions.list) ? versions.list : [])
    one.send({ t: 'ready', version: Object(listed).version })
}

/** The ids of the tasks that were handed to a worker so far, in their order. */
export const tasksOf = (one: RawWorker): string[] =>
  one.heard.filter((message) => message.t === 'work').map((message) => String(Object(message.task).id))

export const workMoment = (ms = 20): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Moves the clock on a second at a time for that many seconds, each worker saying that it is alive. */
export async function seconds(advance: (ms: number) => void, count: number, workers: RawWorker[] = []): Promise<void> {
  for (let i = 0; i < count; i++) {
    advance(1000)
    for (const one of workers) one.send({ t: 'alive', tasks: tasksOf(one) })
    await workMoment(5)
  }
  await workMoment()
}

/** Waits until something holds, and fails where it never comes to. */
export async function untilAsync(what: string, holds: () => boolean | Promise<boolean>): Promise<void> {
  for (let i = 0; i < 2000; i++) {
    if (await holds()) return
    await workMoment(5)
  }
  assert.fail(`never: ${what}`)
}

/** Ends a task on a worker as done, and waits until the writer saved it. */
export async function done(one: RawWorker, task: string, result: unknown, cpuMs = 0): Promise<void> {
  one.send({ t: 'done', task, result, cpuMs })
  for (let i = 0; i < 2000; i++) {
    if (one.heard.some((message) => message.t === 'saved' && message.task === task)) return
    await workMoment(5)
  }
  assert.fail(`the writer never saved ${task}: it sent ${JSON.stringify(one.heard.map((message) => message.t))}`)
}

/** Every row of the counts, as written so far. */
export async function countsOf(app: App): Promise<Count[]> {
  const rows: unknown = await app.read(counts.where({}), { as: 'system' })
  return (Array.isArray(rows) ? rows : []).map((one) => ({
    day: new Date(Object(one).day).toISOString().slice(0, 10),
    name: String(Object(one).name),
    answeredBy: String(Object(one).answeredBy),
    caller: String(Object(one).caller),
    unit: String(Object(one).unit),
    amount: Number(Object(one).amount),
  }))
}

/** The amount of one unit of the counts that fit what is named, summed. */
export const amountOf = (rows: Count[], unit: string, o: Partial<Count> = {}): number =>
  rows
    .filter((one) => one.unit === unit && Object.entries(o).every(([key, value]) => Reflect.get(one, key) === value))
    .reduce((sum, one) => sum + one.amount, 0)

/** What `app.work()` answers of one kind. */
export const kindIn = (app: App, kind: string): Record<string, unknown> =>
  Object(app.work().find((one) => Reflect.get(Object(one), 'kind') === kind))

/**
 * A worker of these kinds started by an engine of its own in this program, with the providers it is handed and
 * the clock of the writer, which reaches the writer with no network. Answers it once the writer holds it ready.
 */
export async function realWorker(
  t: TestContext,
  writer: { app: () => App; clock: Clock },
  o: { kinds?: string[]; providers?: Record<string, Provider>; sent?: (frame: Frame) => void } = {},
): Promise<Worker> {
  const providers = o.providers ?? {}
  const engine = engineOf(t, { makers: { clock: () => writer.clock, providers: () => providers } })
  const folder = join(workFolder(t), `worker-${Math.random().toString(36).slice(2)}`)
  const one = await engine.work({
    from: 'http://writer.test',
    key: joiningKeys.free,
    kinds: o.kinds ?? ['gpu'],
    folder,
    insecure: true,
    reach: () => ({
      request: (request, how) => writer.app().request(request, how),
      link: (request) => {
        const link = writer.app().link(request)
        // What the worker sends its writer is told to the test, where it asks.
        return {
          send: (frame: Frame) => {
            o.sent?.(frame)
            link.send(frame)
          },
          each: (take, closed) => link.each(take, closed),
          close: () => link.close(),
        }
      },
    }),
  })
  t.after(() => one.close({ now: true }).catch(() => undefined))
  await untilAsync('the worker is ready', () =>
    writer
      .app()
      .workers()
      .some((listed) => Reflect.get(Object(listed), 'ready').length > 0),
  )
  return one
}
