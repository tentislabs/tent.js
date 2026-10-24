import assert from 'node:assert/strict'
import test from 'node:test'
import { send } from './apps.ts'
import { helped } from './helping.ts'
import { notDropped } from './started.ts'

/** The code that a promise was refused with, or `ok`. */
const codeOf = (call: unknown): Promise<string> =>
  Promise.resolve(call).then(
    () => 'ok',
    (error: unknown) => String(Reflect.get(Object(error), 'code')),
  )

/** A promise and what settles it, so that a test lets a model go on when it says. */
function gate(): { held: Promise<void>; go(): void } {
  let go = (): void => undefined
  const held = new Promise<void>((done) => {
    go = done
  })
  return { held, go }
}

test('[27-5] from an action that waits: the action is answered the text of the run', async (t) => {
  const h = await helped(t)
  h.say((request) => ({ text: `You said ${request.messages.at(-1)?.text}` }))
  assert.deepEqual(await h.app.call('askHelper', { message: 'Hi.' }, { as: h.maya }), { text: 'You said Hi.' })
})

test('[27-5] a start from code is checked like one through the door, and an agent with no access is T0001 at the door', async (t) => {
  const h = await helped(t)
  assert.equal(await codeOf(h.app.call('askBadly', {}, { as: h.maya })), 'T0002')
  const answered = await send(h.app, `${h.origin}/_t/call/closed`, { input: { message: 'Hi.' } })
  assert.equal(answered.error.code, 'T0001')
})

test('[27-5] two starts at once on one conversation: one is refused with T7103', async (t) => {
  const h = await helped(t)
  const { held, go } = gate()
  t.after(go)
  h.say(async () => {
    await held
    return { text: 'Done.' }
  })
  const chat = String(Reflect.get(Object(await h.app.call('newChat', {}, { as: h.maya })), 'id'))
  const both = await Promise.all(
    [1, 2].map((n) => codeOf(h.app.start('strict', { message: `Start ${n}.`, thread: chat }, { as: h.maya }))),
  )
  assert.deepEqual(both.sort(), ['T7103', 'ok'])
})

test("[27-5] with then: 'wait' the second runs after the first, their rows stand in that order, and working names it with its message while it waits", async (t) => {
  const h = await helped(t)
  const { held, go } = gate()
  t.after(go)
  let first = true
  h.say(async (request) => {
    if (first) {
      first = false
      await held
    }
    return { text: `Answer to ${request.messages.at(-1)?.text}` }
  })
  const chat = String(Reflect.get(Object(await h.app.call('newChat', {}, { as: h.maya })), 'id'))
  const one = notDropped(await h.app.start('helper', { message: 'First.', thread: chat }, { as: h.maya }))
  const two = notDropped(await h.app.start('helper', { message: 'Second.', thread: chat }, { as: h.maya }))
  const working: unknown = await h.app.call('helper.working', { thread: chat }, { as: h.maya })
  const queued = (Array.isArray(working) ? working : []).find((entry) => Reflect.get(Object(entry), 'run') === two.run)
  assert.equal(Reflect.get(Object(queued), 'state'), 'queued')
  assert.equal(Reflect.get(Object(queued), 'message'), 'Second.')
  go()
  assert.deepEqual(await h.app.runs.wait(one.run), { text: 'Answer to First.' })
  assert.deepEqual(await h.app.runs.wait(two.run), { text: 'Answer to Second.' })
  const rows: unknown = await h.app.read({ from: 'messages' }, { as: { kind: 'system' } })
  assert.deepEqual(
    (Array.isArray(rows) ? rows : []).map(
      (row) => `${Reflect.get(Object(row), 'who')} ${Reflect.get(Object(row), 'text')}`,
    ),
    ['user First.', 'assistant Answer to First.', 'user Second.', 'assistant Answer to Second.'],
  )
})
