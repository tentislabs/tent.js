import assert from 'node:assert/strict'
import { test } from 'node:test'
import { codeOf, nobody, running, send } from './apps.ts'

test('[27-5] a start of an agent by app.start asks its rule made with allow, as a start through the door does: a rule that lets nobody in refuses a visitor', async (t) => {
  const { app } = await running(t, { project: 'reviewAgent' })
  assert.equal(await codeOf(app.start('gated', { message: 'hello' }, { as: nobody })), 'T0006')
})

test('[27-6] a member of an agent whose access is a rule made with allow asks that rule: a rule that lets nobody in refuses a visitor', async (t) => {
  const { app, origin } = await running(t, { project: 'reviewAgent' })
  const answered = await send(app, `${origin}/_t/call/gated.working`, { input: {} })
  assert.equal(answered.error.code, 'T0006', JSON.stringify(answered.body))
})

test('[44-5] the address of the picture of a shared link passes step 4 as nobody: it is counted for its address on anyonePerMinute', async (t) => {
  const { app, origin } = await running(t, {
    change: (description) => Object.assign(description.project, { limits: { anyonePerMinute: 2 } }),
  })
  const statuses: number[] = []
  for (let k = 0; k < 3; k++) statuses.push((await app.request(new Request(`${origin}/_t/seo/image/none?/`))).status)
  assert.deepEqual(statuses, [404, 404, 429])
})

test('[23-31] a route that states system has full access: the handle runs is given there, as to an action that states it', async (t) => {
  const { app, origin } = await running(t, { project: 'mendedRouted' })
  const answer = await app.request(new Request(`${origin}/runs`))
  assert.deepEqual([answer.status, await answer.text()], [200, '0'])
})

test('[21-15] an app that is closed gives the calls in flight web.stopTime of its engine, and no fixed time', async (t) => {
  const { app } = await running(t, { project: 'mendedRouted', engine: { web: { stopTime: '1 second' } } })
  void app.call('waitsLong', {}, { as: nobody }).catch(() => undefined)
  await new Promise((done) => setTimeout(done, 200))
  const began = performance.now()
  await app.close()
  const took = performance.now() - began
  assert.ok(took < 5000, `closed after ${Math.round(took)} ms`)
})
