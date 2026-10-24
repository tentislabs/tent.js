import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

/** The desk with a helper, two people of the staff, a person of hr and one who is not. */
async function helped(t: TestContext): Promise<{ app: TestApp; hr: string; plain: string; pia: Caller }> {
  const app = await testApp({ folder: copyOf(t, 'helped') })
  t.after(() => app.close())
  for (const [name, salary] of [
    ['Ada', 5000],
    ['Bob', 4000],
  ] as const)
    await app.write([{ add: 'staff', values: { name, salary } }], system)
  const hr = String((await app.user({ name: 'Hana', roles: ['hr'] })).user?.id)
  const pia = await app.user({ name: 'Pia', roles: [] })
  return { app, hr, plain: String(pia.user?.id), pia }
}

/** What a faked model is handed of a request: its messages, the last of which it answers. */
interface Asked {
  messages: { who: string; result?: unknown; error?: unknown }[]
}

/** A faked model that asks for one tool when a person spoke last, and else answers what the tool answered, whole. */
const oneTool =
  (tool: string, input: unknown = {}) =>
  (request: Asked) => {
    const last = request.messages.at(-1)
    if (last?.who === 'user') return { calls: [{ tool, with: input }] }
    return { text: JSON.stringify(last?.error ?? last?.result ?? null) }
  }

const textOf = (answer: unknown): string => String(Reflect.get(Object(answer), 'text'))

test('[45-16] a model working for a caller outside a read rule of a column is handed rows without it, as a page is; one for a caller inside the rule is handed it', async (t) => {
  const { app, hr, plain } = await helped(t)
  app.fake('writer', oneTool('allStaff'))
  const outside = textOf(await app.as(plain).call('helper', { message: 'Who works here?' }))
  assert.match(outside, /Ada/)
  assert.equal(outside.includes('salary'), false, outside)
  const inside = textOf(await app.as(hr).call('helper', { message: 'Who works here?' }))
  assert.match(inside, /"salary":5000/)
})

test("[45-16] an agent's memory is rows of the builder's own table, and a row older than the keep of that table is removed", async (t) => {
  const { app, plain } = await helped(t)
  app.fake('writer', () => ({ text: 'Fine.' }))
  const chat = String(Reflect.get(Object(await app.as(plain).call('newChat', {})), 'id'))
  await app.as(plain).call('helper', { message: 'Hi.', thread: chat })
  const kept = async (): Promise<number> => {
    const rows: unknown = await app.read({ from: 'messages' }, system)
    return Array.isArray(rows) ? rows.length : 0
  }
  assert.ok((await kept()) >= 2, 'the turn is kept')
  app.clock.advance('31 days')
  for (let tries = 0; tries < 400 && (await kept()) > 0; tries++) await new Promise((done) => setTimeout(done, 25))
  assert.equal(await kept(), 0, 'the rows past their keep are removed by the upkeep')
})

test("[45-17] an undo of an agent's run takes back the rows its tool calls wrote, and nothing else", async (t) => {
  const { app, plain, pia } = await helped(t)
  await app.as(plain).call('addNote', { title: 'by the person' })
  app.fake('writer', oneTool('addNote', { title: 'by the helper' }))
  const started = await app.start('helper', { message: 'Note it.' }, { as: pia })
  assert.ok('run' in started, 'the start was not dropped')
  const { run } = started
  await app.runs.wait(run)
  const titles = async (): Promise<string[]> => {
    const rows: unknown = await app.read({ from: 'notes', sort: [{ by: 'title' }] }, system)
    return (Array.isArray(rows) ? rows : []).map((one) => String(Reflect.get(Object(one), 'title')))
  }
  assert.deepEqual(await titles(), ['by the helper', 'by the person'])
  const undone: Record<string, unknown> = Object(await app.call('undoRun', { run }, system))
  assert.equal(undone.undone, 1)
  assert.deepEqual(undone.clashes, [])
  assert.deepEqual(await titles(), ['by the person'])
})
