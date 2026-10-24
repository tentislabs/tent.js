import assert from 'node:assert/strict'
import test from 'node:test'
import type { Provider, ReplyRequest } from '../index.ts'
import { codeOf, running, system } from './apps.ts'
import { addBoardUser, cookieOf, untilTried, watcher } from './watching.ts'
import { notDropped } from './started.ts'

/** A model of the test that asks for the refund of one order when a person spoke last. */
const mine: Provider = {
  async *reply(o: ReplyRequest) {
    const last = o.messages.at(-1)
    if (last?.who === 'user') yield { end: { text: '', calls: [{ id: 'c1', tool: 'refund', input: { order: 'o1' } }] } }
    else yield { end: { text: 'Done.', calls: [] } }
  },
}

test("[50-12.6] a run's id that names another tenant's file, handed to helper.approve and to a run-watch, is not found: the checks are made on the run that the file holds", async (t) => {
  const { app, origin } = await running(t, {
    project: 'reviewTeams',
    engine: { makers: { providers: () => ({ mine }) } },
  })
  const north = String(Object(await app.call('addTeam', { name: 'North' }, { as: system })).id)
  const south = String(Object(await app.call('addTeam', { name: 'South' }, { as: system })).id)
  await app.call('addOrder', { team: north, title: 'first' }, { as: system })
  let flowRun = ''
  await untilTried('the run of the team waits', () => {
    const [one] = app.runs.find({ flow: 'onOrder', of: { table: 'teams', id: north } })
    flowRun = one?.id ?? ''
    return one?.state === 'waiting'
  })
  assert.ok(flowRun.includes('.teams.'), flowRun)
  const maya = await addBoardUser(app, 'Maya')
  const as = { kind: 'user' as const, user: { id: maya, roles: [] } }
  const { run } = notDropped(await app.start('helper', { message: 'Refund.' }, { as }))
  await untilTried('the ask waits', () => (app.runs.read(run)?.steps ?? []).some((one) => one.state === 'waiting'))
  const ask = { step: 'ask 1.1', repeat: 1, n: 1 }
  const forged = [`${run}.teams.${south}`, `${run}.teams.${north}`, flowRun, `${flowRun.split('.')[0]}.teams.${south}`]
  for (const id of forged) {
    assert.equal(await codeOf(app.call('helper.approve', { run: id, ...ask }, { as })), 'T0001', `approve ${id}`)
    assert.equal(await codeOf(app.call('helper.stop', { run: id }, { as })), 'T0001', `stop ${id}`)
  }
  const page = watcher(app, origin, { cookie: cookieOf(app, maya), as: maya })
  for (const [i, id] of forged.entries()) page.send({ t: 'run-watch', id: `f${i}`, run: id })
  await untilTried('every watch failed', () => page.of('failed').length === forged.length)
  assert.deepEqual(
    page.of('failed').map((one) => Object(one.error).code),
    forged.map(() => 'T0001'),
  )
  page.close()
  // Her own run still waits, and the run of the team was not answered.
  assert.equal(app.runs.read(run)?.state, 'waiting')
  assert.equal(app.runs.find({ flow: 'onOrder', of: { table: 'teams', id: north } })[0]?.state, 'waiting')
  // A run that waits in a file of a tenant keeps the program from ending once the app closed: both are ended here.
  app.runs.approve(flowRun, 'go on')
  await app.runs.wait(flowRun)
  app.runs.stop(run)
})
