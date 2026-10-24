import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { App } from '../index.ts'
import { addUser, codeOf, logRows, nobody, refusal, send, system } from './apps.ts'
import { flowing, marksOf, settle, started, untilWithin, untilState } from './flowing.ts'

/** A browser of a user, by a session that the test made: its cookie, and the user its page names. */
const browserOf = (app: App, user: Caller): { cookie: string; as: string } => ({
  cookie: app.session(user),
  as: String(user.user?.id),
})

test('[23-30a] a flow that states `access` is called at `/_t/call/`: the call starts a run, waits, and answers the answer of the flow through its `output`', async (t) => {
  const { app, origin } = await flowing(t)
  const ada = await addUser(app, 'Ada')
  const bob = await addUser(app, 'Bob', ['staff'])
  const [asAda, asBob] = [browserOf(app, ada), browserOf(app, bob)]
  const call = (flow: string, input: unknown, by?: { cookie: string; as: string }) =>
    send(app, `${origin}/_t/call/${flow}`, {
      input,
      ...(by ? { body: JSON.stringify({ input, as: by.as }), headers: { cookie: by.cookie } } : {}),
    })

  const answered = await call('welcome', { name: 'Ada' }, asAda)
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  assert.deepEqual(answered.body, { ok: true, value: { greeting: 'welcome Ada' } }, 'only what `output` names leaves')
  const [run] = app.runs.find({ flow: 'welcome' })
  assert.deepEqual([run.state, run.as, run.startedBy], ['done', 'starter', { kind: 'user', id: ada.user?.id }])
  const [mark] = Object(await app.call('allMarks', {}, { as: system }))
  assert.equal(mark.by, ada.user?.id, 'the run ran as its starter')

  // A flow that states no `output` answers its caller nothing.
  assert.deepEqual((await call('staffWelcome', { name: 'Bob' }, asBob)).body, { ok: true })
  // A caller that the rule of the flow refuses, and one that is nobody.
  assert.equal((await call('staffWelcome', { name: 'Ada' }, asAda)).error.code, 'T3101')
  assert.equal((await call('welcome', { name: 'x' })).error.code, 'T0006')
  // An input that does not fit, and a flow that states no `access`, which is not found.
  assert.equal((await call('welcome', { name: 7 }, asAda)).error.code, 'T0002')
  assert.equal((await call('greet', { name: 'Ada' }, asAda)).error.code, 'T0001')
  assert.equal(app.runs.find({ flow: 'greet' }).length, 0)
})

test('[23-30a] [16-2@7b] a run that outlasts `actionTime` answers T0008 with `fields.run`: the same call with `{ run }` waits again, with `stop` it stops the run, and another caller is answered T0001', async (t) => {
  const { app, origin, dataFolder } = await flowing(t)
  const ada = await addUser(app, 'Ada')
  const bob = await addUser(app, 'Bob')
  const [asAda, asBob] = [browserOf(app, ada), browserOf(app, bob)]
  const call = (input: unknown, by: { cookie: string; as: string }) =>
    send(app, `${origin}/_t/call/welcome`, {
      body: JSON.stringify({ input, as: by.as }),
      headers: { cookie: by.cookie },
    })

  const late = await call({ name: 'Ada', wait: true }, asAda)
  assert.equal(late.status, 500)
  assert.equal(late.error.code, 'T0008')
  const run = String(Object(late.error.fields).run)
  assert.equal(app.runs.read(run)?.state, 'waiting', 'the run goes on')
  // The same call with `{ run }` alone waits for that run again.
  const again = await call({ run }, asAda)
  assert.equal(again.error.code, 'T0008')
  assert.equal(Object(again.error.fields).run, run)
  assert.equal(app.runs.find({ flow: 'welcome' }).length, 1, 'no second run was started')
  // Another caller reaches neither the run nor its stop.
  assert.equal((await call({ run }, asBob)).error.code, 'T0001')
  assert.equal((await call({ run, stop: true }, asBob)).error.code, 'T0001')
  assert.equal(app.runs.read(run)?.state, 'waiting')
  // Once the run has ended, the call with `{ run }` answers its answer.
  app.runs.approve(run, 'go on')
  assert.deepEqual((await call({ run }, asAda)).body, { ok: true, value: { greeting: 'welcome Ada' } })

  const second = await call({ name: 'Ada', wait: true }, asAda)
  const stopped = String(Object(second.error.fields).run)
  assert.deepEqual((await call({ run: stopped, stop: true }, asAda)).body, { ok: true })
  assert.equal(app.runs.read(stopped)?.state, 'stopped')
  assert.equal(
    (await call({ run: stopped }, asAda)).error.code,
    'T0009',
    'a stopped run answers T5106, which no caller is shown',
  )
  const kinds = logRows(dataFolder, 'calls').filter((row) => row.name === 'welcome')
  assert.ok(kinds.length >= 7 && kinds.every((row) => row.kind === 'flow'), 'each call of the flow is a row of the log')
})

test('[23-31] an action that states `system` and reads `runs.read`, read by a page, answers, and one that calls `runs.stop` there is T0013', async (t) => {
  const { app, origin, dataFolder } = await flowing(t)
  const run = await started(app, 'waitsForPerson')
  await untilState(app, run, 'waiting')
  const read = (name: string) => send(app, `${origin}/_t/read/${name}`, { input: { run } })
  assert.deepEqual((await read('runOf')).body, { ok: true, value: 'waiting' })
  // An action that a page reads is called read-only: what does more than read is refused.
  const refused = await read('stopRun')
  assert.equal(refused.error.code, 'T0009')
  assert.equal(app.runs.read(run)?.state, 'waiting', 'nothing was stopped')
  const [failed] = logRows(dataFolder, 'calls').filter((row) => row.name === 'stopRun')
  assert.equal(failed.code, 'T0013')
  // Called by a press, the same action stops the run.
  await app.call('stopRun', { run }, { as: nobody })
  assert.equal(app.runs.read(run)?.state, 'stopped')
})

test('[11-2@7b] a function that a step calls runs as the caller of its run, and the `runs` handle is full access', async (t) => {
  const { app } = await flowing(t)
  const ada = await addUser(app, 'Ada')
  const bob = await addUser(app, 'Bob', ['staff'])
  await app.call('addNote', { title: 'of Ada' }, { as: ada })
  await app.call('addNote', { title: 'of Bob' }, { as: bob })
  await app.call('addNote', { title: 'of Bob too' }, { as: bob })

  // A flow that runs as its starter: each function it calls passes its own rule as that caller, and `db` is theirs.
  const asAda = await app.runs.wait(await started(app, 'asStarter', undefined, ada))
  assert.deepEqual(asAda, { user: ada.user?.id, mine: 1, staff: 'T3101', direct: 1 })
  const asBob = await app.runs.wait(await started(app, 'asStarter', undefined, bob))
  assert.deepEqual(asBob, { user: bob.user?.id, mine: 2, staff: 0, direct: 2 })
  // A flow that does not state `as: 'starter'` has full access, whoever started it: it passes every rule.
  const full = await app.runs.wait(await started(app, 'asSystem', undefined, ada))
  assert.deepEqual(full, { user: 'no user', all: 3, staff: 0, direct: 3 })
  assert.deepEqual(app.runs.find({ flow: 'asSystem' })[0].startedBy, { kind: 'user', id: ada.user?.id })

  // The `runs` handle: a function that states no `system` has no full access, whoever calls it.
  const waiting = await started(app, 'waitsForPerson')
  await untilState(app, waiting, 'waiting')
  assert.equal(await codeOf(app.call('findRuns', { flow: 'waitsForPerson' }, { as: ada })), 'T0013')
  // Called by the system, the same function is code of the system, which has full access.
  assert.equal(await app.call('findRuns', { flow: 'waitsForPerson' }, { as: system }), 1)
  // One that states `system` reads the runs and answers a step that waits for a person.
  assert.equal(await app.call('runOf', { run: waiting }, { as: system }), 'waiting')
  await app.call('approveRun', { run: waiting, step: 'approval', yes: true }, { as: system })
  assert.deepEqual(await app.runs.wait(waiting), {
    approved: true,
    data: { by: 'the action' },
    shown: { ask: 'May it go on?' },
  })
  const refusedOne = await started(app, 'waitsForPerson')
  await untilState(app, refusedOne, 'waiting')
  await app.call('approveRun', { run: refusedOne, step: 'approval', yes: false }, { as: system })
  assert.deepEqual(await app.runs.wait(refusedOne), { approved: false, shown: { ask: 'May it go on?' } })
})

test('[23-5] [16-2@7b] work outside a step is refused with T5001 and its fix, and reading is allowed there', async (t) => {
  const { app } = await flowing(t)
  await app.call('addMark', { what: 'one' }, { as: system })
  // Between two steps a flow reads through `db` and calls a query.
  assert.equal(await app.runs.wait(await started(app, 'outsideStep', { what: 'nothing' })), 2)
  for (const what of ['change', 'action', 'flow', 'start', 'now', 'handle']) {
    const refused = await refusal(app.runs.wait(await started(app, 'outsideStep', { what })))
    assert.equal(refused.code, 'T5001', what)
    assert.match(String(refused.fix), /inside a step/, what)
  }
  await settle()
  assert.deepEqual(await marksOf(app), ['one'], 'nothing was written, and no run was started')
  assert.equal(app.runs.find({ flow: 'greet' }).length, 0)
  await untilWithin(() => app.runs.find({ flow: 'outsideStep', states: ['failed'] }).length === 6, 'six runs failed')
})
