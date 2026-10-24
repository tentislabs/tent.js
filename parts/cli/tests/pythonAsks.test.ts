import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Provider, ReplyPart } from '../../engine/index.ts'
import { opened, sharedPython, untilWithin } from './pythonApps.ts'
import { notDropped } from './started.ts'

const shared = sharedPython('asks')

/** A model that asks for the python first, and then says what it answered. */
const standIn: Provider = {
  async *reply(o): AsyncGenerator<ReplyPart> {
    const last = o.messages.at(-1)
    if (last?.who === 'tool') {
      const said = String(last.result ?? last.error)
      yield { end: { text: said, calls: [] } }
      return
    }
    yield { end: { text: '', calls: [{ id: 'c1', tool: 'sendsFromPython', input: {} }] } }
  },
}

test('[25-13] under a tool call that nobody agreed to, a sending call that a python makes through tent.call makes the step wait for a yes, and runs once it is given', async (t) => {
  const { app, user } = await opened(t, shared)
  app.standIn('pyThinker', standIn)
  const ada = await user()
  const { run } = notDropped(await app.start('pyHelper', { message: 'Send it.' }, { as: ada }))
  const waiting = () => app.runs.read(run)?.steps.find((one) => one.state === 'waiting')
  await untilWithin(() => waiting() !== undefined, 'the step waits for a yes', 60_000)
  const step = waiting()
  if (!step) throw new Error('no step waits')
  assert.match(step.name, /sendsFromPython/)
  // The ask names what was held: the sending call inside the function that Python called.
  assert.match(JSON.stringify(step), /"call":"(sendOut|fetch)"/)
  app.runs.approve(run, step.name)
  await untilWithin(() => app.runs.read(run)?.state === 'done', 'the run ended', 60_000)
  assert.equal(Reflect.get(Object(app.runs.read(run)?.answer), 'text'), 'sent')
})
