import type { TestContext } from 'node:test'
import type { ReplyRequest } from '../index.ts'
import type { FakeAnswer, TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'

/** A step of a run as `app.runs.read` shows it. */
export interface Shown {
  name: string
  state: string
  show?: unknown
  result?: unknown
  error?: unknown
}

/** A test app of the project of sequences, a user, and four open orders, three of them of more than 100. */
export async function sequencedApp(t: TestContext): Promise<{
  app: TestApp
  maya: Awaited<ReturnType<TestApp['user']>>
  orders: string[]
}> {
  const app = await testApp({ folder: copyOf(t, 'sequenced') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  const orders: string[] = []
  for (const total of [50, 150, 250, 350])
    orders.push(String(Reflect.get(Object(await app.as(maya).call('addOrder', { item: 'tent', total })), 'id')))
  return { app, maya, orders }
}

/**
 * A faked model that hands one sequence where a person spoke last, with the calls of `beside` in the same answer,
 * answers each typed value with `value`, and else answers what the last tool answered, as JSON.
 */
export const handing =
  (run: string, o: { beside?: { tool: string; with?: unknown }[]; value?: unknown } = {}) =>
  (request: ReplyRequest): FakeAnswer => {
    if (request.shape !== undefined) return { value: o.value ?? true }
    const last = request.messages.at(-1)
    if (last?.who === 'user') return { calls: [{ tool: 'sequence', with: { run } }, ...(o.beside ?? [])] }
    const tool = request.messages.filter((one) => one.who === 'tool').find((one) => one.id === last?.id) ?? last
    return { text: `Done: ${JSON.stringify(tool?.error ?? tool?.result ?? null)}` }
  }

/** The text of a sequence, one line for each entry. */
export const lines = (...written: string[]): string => written.join('\n')

/** The sequence of the work order: the late orders refunded and mailed, one after another. */
export const lateOrders = lines(
  'const open = myOrders({})',
  'const late = where(open, { total: { above: 100 } })',
  'for (const o of late) {',
  '  const r = refund({ order: o.id })',
  '  mailReceipt({ order: o.id, refund: r.refund })',
  '}',
  'return { refunded: late.length }',
)

/** The steps of a run. */
export const stepsOf = (app: TestApp, run: string): Shown[] =>
  (app.runs.read(run)?.steps ?? []).map((one) => Object(one))

/** Waits until a step of a run waits, or the run ends, and answers the step that waits. */
export async function waiting(app: TestApp, run: string, besides: string[] = []): Promise<Shown | undefined> {
  for (let tries = 0; tries < 1000; tries++) {
    const found = stepsOf(app, run).find((one) => one.state === 'waiting' && !besides.includes(one.name))
    if (found) return found
    const state = app.runs.read(run)?.state
    if (state === 'done' || state === 'failed' || state === 'stopped') return undefined
    await new Promise((done) => setTimeout(done, 10))
  }
  return undefined
}

/** How many rows a query of the project answers the user. */
export async function rowsOf(app: TestApp, as: Awaited<ReturnType<TestApp['user']>>, query: string): Promise<number> {
  const rows: unknown = await app.as(as).call(query, {})
  return Array.isArray(rows) ? rows.length : -1
}

/** The text a run ended with. */
export async function answered(app: TestApp, run: string): Promise<string> {
  return String(Reflect.get(Object(await app.runs.wait(run)), 'text'))
}
